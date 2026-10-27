import { expect, layer } from "@effect/vitest"
import { Duration, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { TestClock } from "effect/testing"
import { v7 as uuidv7 } from "uuid"
import { runMigrations } from "../../src/db/migrate.ts"
import { Places, PURGE_AFTER } from "../../src/places/places.ts"
import { Tags } from "../../src/places/tags.ts"
import { IntegrationLayer } from "../layers/postgis.ts"

const Organize = Layer.effectDiscard(runMigrations).pipe(
  Layer.provideMerge(Places.layer),
  Layer.provideMerge(Tags.layer),
  Layer.provideMerge(IntegrationLayer),
)

const seedDeleted = (deletedAt: Date) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const userId = uuidv7()
    const placeId = uuidv7()
    yield* sql`
      insert into users (id, name, email, role)
      values (${userId}, 'Purge', ${`${userId}@example.com`}, 'admin')`.pipe(Effect.orDie)
    yield* sql`
      insert into places (id, owner_id, name, category, location, source, deleted_at)
      values (
        ${placeId}, ${userId}, 'Gone', 'other',
        st_setsrid(st_makepoint(0, 0), 4326)::geography, 'manual', ${deletedAt}
      )`.pipe(Effect.orDie)
    return placeId
  })

layer(Organize, { timeout: 120_000 })("purgeDeletedPlaces", (it) => {
  it.effect("does not purge a place deleted less than 30 days ago", () =>
    Effect.gen(function* () {
      const placeId = yield* seedDeleted(new Date(0))
      yield* TestClock.setTime(Duration.toMillis(Duration.days(29)))
      const places = yield* Places
      expect(yield* places.purgeExpired).toBe(0)
      const sql = yield* SqlClient.SqlClient
      const [row] = yield* sql<{ id: string }>`select id from places where id = ${placeId}`.pipe(
        Effect.orDie,
      )
      expect(row?.id).toBe(placeId)
    }),
  )

  it.effect("purges a place once it has been deleted for 30 days", () =>
    Effect.gen(function* () {
      const placeId = yield* seedDeleted(new Date(0))
      yield* TestClock.setTime(Duration.toMillis(PURGE_AFTER) + 1)
      const places = yield* Places
      expect(yield* places.purgeExpired).toBeGreaterThanOrEqual(1)
      const sql = yield* SqlClient.SqlClient
      const rows = yield* sql`select id from places where id = ${placeId}`.pipe(Effect.orDie)
      expect(rows).toEqual([])
    }),
  )
})
