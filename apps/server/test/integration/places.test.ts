import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { type Browser, TestApp } from "../layers/app.ts"

const password = "correct horse battery"
const SESSION = "0b6a3c2e-6f4e-4a1f-9a55-6c1a1e0f2d11"
const MICHELE = "ChIJ-fixture-da-michele"

const run = <A>(f: (app: TestApp["Service"]) => Promise<A>) =>
  Effect.gen(function* () {
    const app = yield* TestApp
    return yield* Effect.promise(() => f(app))
  })

const addFromGoogle = (browser: Browser, googlePlaceId: string) =>
  browser.send("POST", "/api/places/google", {
    googlePlaceId,
    source: "autocomplete",
    sessionToken: SESSION,
  })

layer(TestApp.layer, { concurrent: false, timeout: 120_000 })("places", (it) => {
  const admin = { browser: undefined as unknown as Browser, id: "" }
  const member = { browser: undefined as unknown as Browser }
  let micheleId = ""

  it.effect("Google features report a missing key before one is set", () =>
    run(async (app) => {
      admin.browser = app.browser()
      await admin.browser.send("POST", "/api/auth/sign-up/email", {
        name: "Alice",
        email: "alice@example.com",
        password,
      })
      admin.id = (await admin.browser.get("/api/me")).body.id

      expect((await admin.browser.get("/api/google/config")).body).toEqual({ mapsApiKey: null })
      const search = await admin.browser.send("POST", "/api/google/autocomplete", {
        input: "michele",
        sessionToken: SESSION,
        near: null,
      })
      expect(search.status).toBe(409)
      expect(search.body._tag).toBe("GoogleKeyMissing")
      expect((await addFromGoogle(admin.browser, MICHELE)).status).toBe(409)
    }),
  )

  it.effect("autocomplete and preview go through Google once a key is set", () =>
    run(async () => {
      const key = await admin.browser.send("PUT", "/api/admin/settings/google-api-key", {
        apiKey: "fixture-key",
      })
      expect(key.status).toBe(200)
      expect((await admin.browser.get("/api/google/config")).body).toEqual({
        mapsApiKey: "fixture-key",
      })

      const search = await admin.browser.send("POST", "/api/google/autocomplete", {
        input: "michele",
        sessionToken: SESSION,
        near: { lat: 40.85, lng: 14.27 },
      })
      expect(search.body).toEqual([
        {
          googlePlaceId: MICHELE,
          primaryText: "L'Antica Pizzeria da Michele",
          secondaryText: "Via Cesare Sersale, Naples, Metropolitan City of Naples, Italy",
        },
      ])

      const preview = await admin.browser.get(
        `/api/google/places/${MICHELE}?sessionToken=${SESSION}`,
      )
      expect(preview.body).toEqual({
        googlePlaceId: MICHELE,
        name: "L'Antica Pizzeria da Michele",
        address: "Via Cesare Sersale, 1, 80139 Napoli NA, Italy",
        location: { lat: 40.8497877, lng: 14.2633047 },
        category: "restaurant",
        existingPlaceId: null,
      })
    }),
  )

  it.effect("saving a Google place stores a PostGIS point and the owner", () =>
    Effect.gen(function* () {
      const saved = yield* run(async () => addFromGoogle(admin.browser, MICHELE))
      expect(saved.status).toBe(200)
      expect(saved.body.created).toBe(true)
      expect(saved.body.place).toMatchObject({
        name: "L'Antica Pizzeria da Michele",
        category: "restaurant",
        googlePlaceId: MICHELE,
        source: "autocomplete",
        status: null,
        location: { lat: 40.8497877, lng: 14.2633047 },
      })
      micheleId = saved.body.place.id

      const sql = yield* SqlClient.SqlClient
      const [row] = yield* sql<{
        owner_id: string
        point: string
        srid: number
        type: string
        utc_offset_minutes: number
        enriched: boolean
      }>`
        select owner_id, st_astext(location) as point, st_srid(location) as srid,
          geometrytype(location::geometry) as type, utc_offset_minutes,
          last_enriched_at is not null as enriched
        from places where id = ${micheleId}`
      expect(row).toEqual({
        owner_id: admin.id,
        point: "POINT(14.2633047 40.8497877)",
        srid: 4326,
        type: "POINT",
        utc_offset_minutes: 60,
        enriched: true,
      })
    }),
  )

  it.effect("adding the same place again lands on the existing one", () =>
    run(async () => {
      const again = await admin.browser.send("POST", "/api/places/google", {
        googlePlaceId: MICHELE,
        source: "map_pick",
        sessionToken: null,
      })
      expect(again.body.created).toBe(false)
      expect(again.body.place.id).toBe(micheleId)

      const preview = await admin.browser.get(`/api/google/places/${MICHELE}`)
      expect(preview.body.existingPlaceId).toBe(micheleId)
      expect((await admin.browser.get("/api/places")).body).toHaveLength(1)
    }),
  )

  it.effect("two concurrent saves of one place create a single row", () =>
    run(async () => {
      const results = await Promise.all([
        addFromGoogle(admin.browser, "ChIJ-fixture-tiergarten"),
        addFromGoogle(admin.browser, "ChIJ-fixture-tiergarten"),
      ])
      expect(results.map((r) => r.status)).toEqual([200, 200])
      expect(results.map((r) => r.body.created).sort()).toEqual([false, true])
      expect(results[0]?.body.place.id).toBe(results[1]?.body.place.id)
    }),
  )

  it.effect("a manual pin needs no Google call", () =>
    run(async () => {
      const pinned = await admin.browser.send("POST", "/api/places/manual", {
        name: "  Secret viewpoint  ",
        category: "trail",
        location: { lat: 46.5, lng: 8.1 },
        address: "",
      })
      expect(pinned.status).toBe(200)
      expect(pinned.body.place).toMatchObject({
        name: "Secret viewpoint",
        category: "trail",
        location: { lat: 46.5, lng: 8.1 },
        address: null,
        googlePlaceId: null,
        source: "manual",
      })

      const list = await admin.browser.get("/api/places")
      expect(list.body.map((p: { name: string }) => p.name)).toEqual([
        "Secret viewpoint",
        "Großer Tiergarten",
        "L'Antica Pizzeria da Michele",
      ])
      const detail = await admin.browser.get(`/api/places/${pinned.body.place.id}`)
      expect(detail.body).toEqual(pinned.body.place)
    }),
  )

  it.effect("manual input is validated", () =>
    run(async () => {
      const outOfRange = await admin.browser.send("POST", "/api/places/manual", {
        name: "Nowhere",
        category: "other",
        location: { lat: 91, lng: 0 },
        address: null,
      })
      expect(outOfRange.status).toBe(400)
      const blank = await admin.browser.send("POST", "/api/places/manual", {
        name: "   ",
        category: "other",
        location: { lat: 1, lng: 1 },
        address: null,
      })
      expect(blank.status).toBe(400)
    }),
  )

  it.effect("places are private to their owner", () =>
    run(async (app) => {
      const invite = await admin.browser.send("POST", "/api/admin/invites", {
        email: "bob@example.com",
      })
      member.browser = app.browser()
      await member.browser.send("POST", "/api/auth/sign-up/email", {
        name: "Bob",
        email: "bob@example.com",
        password,
        inviteToken: new URL(invite.body.url).pathname.split("/").pop(),
      })

      expect((await member.browser.get("/api/places")).body).toEqual([])
      expect((await member.browser.get(`/api/places/${micheleId}`)).status).toBe(404)
      expect((await member.browser.send("DELETE", `/api/places/${micheleId}`)).status).toBe(404)

      const preview = await member.browser.get(`/api/google/places/${MICHELE}`)
      expect(preview.body.existingPlaceId).toBeNull()
      const own = await addFromGoogle(member.browser, MICHELE)
      expect(own.body.created).toBe(true)
      expect(own.body.place.id).not.toBe(micheleId)
    }),
  )

  it.effect("removing a place hides it and allows saving it again", () =>
    run(async (app) => {
      expect((await admin.browser.send("DELETE", `/api/places/${micheleId}`)).status).toBe(204)
      expect((await admin.browser.get(`/api/places/${micheleId}`)).status).toBe(404)
      expect((await admin.browser.send("DELETE", `/api/places/${micheleId}`)).status).toBe(404)

      const again = await addFromGoogle(admin.browser, MICHELE)
      expect(again.body.created).toBe(true)
      expect(again.body.place.id).not.toBe(micheleId)

      expect((await app.browser().get("/api/places")).status).toBe(401)
    }),
  )

  it.effect("an unknown Google place reports Google's error", () =>
    run(async () => {
      const response = await admin.browser.get("/api/google/places/ChIJ-unknown")
      expect(response.status).toBe(502)
      expect(response.body.message).toBe("Google Places: Requested entity was not found.")
    }),
  )
})
