import { access } from "node:fs/promises"
import { join } from "node:path"
import { expect, layer } from "@effect/vitest"
import { Duration, Effect, Layer, Option } from "effect"
import { SqlClient } from "effect/sql"
import { TestClock } from "effect/testing"
import { v7 as uuidv7 } from "uuid"
import { AppConfig } from "../../src/config.ts"
import { runMigrations } from "../../src/db/migrate.ts"
import { Media } from "../../src/media/media.ts"
import { Places, PURGE_AFTER } from "../../src/places/places.ts"
import { purgeDeletedPlaces } from "../../src/places/purge.ts"
import { Tags } from "../../src/places/tags.ts"
import { InstanceSettings } from "../../src/settings/instance-settings.ts"
import { type Browser, TestApp } from "../layers/app.ts"
import { IntegrationLayer } from "../layers/postgis.ts"

/** 1×1 PNG */
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

const password = "correct horse battery"

const run = <A>(f: (app: TestApp["Service"]) => Promise<A>) =>
  Effect.gen(function* () {
    const app = yield* TestApp
    return yield* Effect.promise(() => f(app))
  })

layer(TestApp.layer, { concurrent: false, timeout: 120_000 })("media http", (it) => {
  const admin = { browser: undefined as unknown as Browser }
  let placeId = ""
  let mediaId = ""
  let mediaUrl = ""
  let thumbUrl = ""

  it.effect("uploads a dish photo with caption and serves thumbnails when signed in", () =>
    run(async (app) => {
      admin.browser = app.browser()
      await admin.browser.send("POST", "/api/auth/sign-up/email", {
        name: "Alice",
        email: "alice@example.com",
        password,
      })
      const saved = await admin.browser.send("POST", "/api/places/manual", {
        name: "Da Michele",
        category: "restaurant",
        location: { lat: 40.85, lng: 14.25 },
        address: null,
      })
      expect(saved.status).toBe(200)
      placeId = saved.body.place.id

      const uploaded = await admin.browser.send("POST", `/api/media/places/${placeId}`, {
        kind: "dish",
        caption: "Margherita",
        filename: "pizza.png",
        mimeType: "image/png",
        contentBase64: TINY_PNG,
      })
      expect(uploaded.status).toBe(200)
      expect(uploaded.body).toMatchObject({
        placeId,
        kind: "dish",
        caption: "Margherita",
        mimeType: "image/png",
      })
      expect(uploaded.body.url).toMatch(/^\/api\/media\/.+\/file$/)
      expect(uploaded.body.thumbUrl).toMatch(/^\/api\/media\/.+\/thumb$/)
      mediaId = uploaded.body.id
      mediaUrl = uploaded.body.url
      thumbUrl = uploaded.body.thumbUrl

      const listed = await admin.browser.get(`/api/media/places/${placeId}`)
      expect(listed.status).toBe(200)
      expect(listed.body).toHaveLength(1)
      expect(listed.body[0].caption).toBe("Margherita")

      const file = await admin.browser.getRaw(mediaUrl)
      expect(file.status).toBe(200)
      expect(file.contentType).toMatch(/image\/png/)
      expect(file.body.byteLength).toBeGreaterThan(0)

      const thumb = await admin.browser.getRaw(thumbUrl)
      expect(thumb.status).toBe(200)
      expect(thumb.contentType).toMatch(/image\/jpeg/)
      expect(thumb.body.byteLength).toBeGreaterThan(0)
    }),
  )

  it.effect("rejects media URLs when signed out", () =>
    run(async (app) => {
      const stranger = app.browser()
      const file = await stranger.getRaw(mediaUrl)
      expect(file.status).toBe(401)
      const thumb = await stranger.getRaw(thumbUrl)
      expect(thumb.status).toBe(401)
    }),
  )

  it.effect("updates caption and deletes media", () =>
    run(async () => {
      const updated = await admin.browser.send("PATCH", `/api/media/${mediaId}`, {
        caption: "Bufala",
      })
      expect(updated.status).toBe(200)
      expect(updated.body.caption).toBe("Bufala")

      const removed = await admin.browser.send("DELETE", `/api/media/${mediaId}`)
      expect(removed.status).toBe(200)
      const listed = await admin.browser.get(`/api/media/places/${placeId}`)
      expect(listed.body).toEqual([])
    }),
  )
})

const StubSettings = Layer.succeed(InstanceSettings, {
  googleApiKey: Effect.succeed(Option.none()),
  view: Effect.die("unused"),
  setGoogleApiKey: () => Effect.die("unused"),
  clearGoogleApiKey: Effect.die("unused"),
  setModuleUpdateCheckHours: () => Effect.die("unused"),
  moduleUpdateCheckHours: Effect.succeed(24),
  householdEnabled: Effect.succeed(false),
  setHouseholdEnabled: () => Effect.die("unused"),
})

const PurgeStack = Layer.effectDiscard(runMigrations).pipe(
  Layer.provideMerge(Media.layer),
  Layer.provideMerge(Places.layer),
  Layer.provideMerge(Tags.layer),
  Layer.provideMerge(IntegrationLayer),
  Layer.provide(StubSettings),
)

layer(PurgeStack, { timeout: 120_000 })("media purge", (it) => {
  it.effect("purge removes media files from disk with the place", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const config = yield* AppConfig
      const media = yield* Media

      const userId = uuidv7()
      const placeId = uuidv7()
      yield* sql`
        insert into users (id, name, email, role)
        values (${userId}, 'Purge', ${`${userId}@example.com`}, 'admin')`.pipe(Effect.orDie)
      yield* sql`
        insert into places (id, owner_id, name, category, location, source, deleted_at)
        values (
          ${placeId}, ${userId}, 'Gone', 'restaurant',
          st_setsrid(st_makepoint(0, 0), 4326)::geography, 'manual', ${new Date(0)}
        )`.pipe(Effect.orDie)

      // Bypass Places.get (soft-deleted) by inserting via service after temporarily clearing deleted_at
      yield* sql`update places set deleted_at = null where id = ${placeId}`.pipe(Effect.orDie)
      const item = yield* media.upload(userId, placeId, {
        kind: "photo",
        caption: "to delete",
        filename: "x.png",
        mimeType: "image/png",
        contentBase64: TINY_PNG,
      })
      yield* sql`update places set deleted_at = ${new Date(0)} where id = ${placeId}`.pipe(
        Effect.orDie,
      )

      const absolute = join(config.mediaDir, `${userId}/${placeId}/${item.id}.png`)
      yield* Effect.promise(() => access(absolute))

      yield* TestClock.setTime(Duration.toMillis(PURGE_AFTER) + 1)
      expect(yield* purgeDeletedPlaces).toBeGreaterThanOrEqual(1)

      const stillOnDisk = yield* Effect.promise(() =>
        access(absolute).then(
          () => true,
          () => false,
        ),
      )
      expect(stillOnDisk).toBe(false)

      const rows = yield* sql`select id from media where place_id = ${placeId}`.pipe(Effect.orDie)
      expect(rows).toEqual([])
    }),
  )
})
