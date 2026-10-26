import { inspect } from "node:util"
import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { runMigrations } from "../../src/db/migrate.ts"
import { Health } from "../../src/health.ts"
import { IntegrationLayer, PostgisContainer } from "../layers/postgis.ts"

layer(IntegrationLayer, { concurrent: false })("migrations on an empty database", (it) => {
  it.effect("apply cleanly", () => runMigrations)

  it.effect("enable PostGIS and trigram search", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const rows = yield* sql<{ extname: string }>`select extname from pg_extension`
      const names = rows.map((row) => row.extname)

      expect(names).toContain("postgis")
      expect(names).toContain("pg_trgm")
    }),
  )

  it.effect("create the users table with its constraints", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const columns = yield* sql<{ column_name: string }>`
        select column_name from information_schema.columns
        where table_name = 'users' order by ordinal_position`

      expect(columns.map((c) => c.column_name)).toEqual([
        "id",
        "name",
        "email",
        "email_verified",
        "image",
        "role",
        "distance_unit",
        "created_at",
        "updated_at",
      ])

      const invalidRole = yield* sql`
        insert into users (id, name, email, role) values ('u1', 'A', 'a@example.com', 'owner')
      `.pipe(Effect.flip)
      expect(invalidRole.cause._tag).toBe("ConstraintError")
      expect(inspect(invalidRole.cause.cause)).toContain("users_role_check")
    }),
  )

  it.effect("are idempotent when run again", () => runMigrations)

  it.effect("leave the instance healthy", () =>
    Effect.gen(function* () {
      const health = yield* Health
      const report = yield* health.check

      expect(report.status).toBe("ok")
      expect(report.checks.database.ok).toBe(true)
    }),
  )
})

layer(IntegrationLayer, { concurrent: false })("health when the database goes away", (it) => {
  it.effect("reports an error instead of hanging", () =>
    Effect.gen(function* () {
      const health = yield* Health
      expect((yield* health.check).status).toBe("ok")

      const { container } = yield* PostgisContainer
      yield* Effect.promise(() => container.stop())

      const report = yield* health.check
      expect(report.status).toBe("error")
      expect(report.checks.database.ok).toBe(false)
    }),
  )
})
