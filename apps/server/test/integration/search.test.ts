import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { type Browser, TestApp } from "../layers/app.ts"

const password = "correct horse battery"
const SESSION = "0b6a3c2e-6f4e-4a1f-9a55-6c1a1e0f2d11"
const MICHELE = "ChIJ-fixture-da-michele"
const TIER = "ChIJ-fixture-tiergarten"
const SPERL = "ChIJ-fixture-cafe-sperl"

const run = <A>(f: (app: TestApp["Service"]) => Promise<A>) =>
  Effect.gen(function* () {
    const app = yield* TestApp
    return yield* Effect.promise(() => f(app))
  })

const search = (browser: Browser, payload: Record<string, unknown>) =>
  browser.send("POST", "/api/search", payload)

layer(TestApp.layer, { concurrent: false, timeout: 180_000 })("search", (it) => {
  const admin = { browser: undefined as unknown as Browser, id: "" }

  it.effect("setup: sign up, set key, add three fixture places", () =>
    run(async (app) => {
      admin.browser = app.browser()
      await admin.browser.send("POST", "/api/auth/sign-up/email", {
        name: "Searcher",
        email: "search@example.com",
        password,
      })
      admin.id = (await admin.browser.get("/api/me")).body.id
      await admin.browser.send("PUT", "/api/admin/settings/google-api-key", {
        apiKey: "fixture-key",
      })
      for (const googlePlaceId of [MICHELE, TIER, SPERL]) {
        const saved = await admin.browser.send("POST", "/api/places/google", {
          googlePlaceId,
          source: "autocomplete",
          sessionToken: SESSION,
        })
        expect(saved.status).toBe(200)
      }
    }),
  )

  it.effect("text search finds pizza by name and cuisine", () =>
    run(async () => {
      const byName = await search(admin.browser, { text: "Michele" })
      expect(byName.status).toBe(200)
      expect(byName.body.map((h: { place: { name: string } }) => h.place.name)).toEqual([
        "L'Antica Pizzeria da Michele",
      ])

      const byCuisine = await search(admin.browser, { text: "pizza" })
      expect(byCuisine.body.map((h: { place: { name: string } }) => h.place.name)).toEqual([
        "L'Antica Pizzeria da Michele",
      ])
    }),
  )

  it.effect("radius around Naples includes Michele and excludes Vienna", () =>
    run(async () => {
      const nearNaples = await search(admin.browser, {
        near: { lat: 40.85, lng: 14.27 },
        radiusKm: 5,
      })
      expect(nearNaples.status).toBe(200)
      const names = nearNaples.body.map((h: { place: { name: string } }) => h.place.name)
      expect(names).toContain("L'Antica Pizzeria da Michele")
      expect(names).not.toContain("Café Sperl")
      expect(nearNaples.body[0].distanceMeters).toBeGreaterThan(0)
      expect(nearNaples.body[0].distanceMeters).toBeLessThan(1000)
    }),
  )

  it.effect("switching the center to Vienna finds Café Sperl", () =>
    run(async () => {
      const nearVienna = await search(admin.browser, {
        near: { lat: 48.2082, lng: 16.3738 },
        radiusKm: 5,
      })
      expect(nearVienna.body.map((h: { place: { name: string } }) => h.place.name)).toEqual([
        "Café Sperl",
      ])
    }),
  )

  it.effect("open filter is accepted on the HTTP API", () =>
    run(async () => {
      const openNow = await search(admin.browser, {
        text: "pizza",
        open: "now",
        near: { lat: 40.85, lng: 14.27 },
        radiusKm: 5,
      })
      expect(openNow.status).toBe(200)
      expect(Array.isArray(openNow.body)).toBe(true)
    }),
  )

  it.effect("category filter separates parks from restaurants", () =>
    run(async () => {
      const parks = await search(admin.browser, { category: "park" })
      expect(parks.body.map((h: { place: { name: string } }) => h.place.name)).toEqual([
        "Großer Tiergarten",
      ])
      const restaurants = await search(admin.browser, { category: "restaurant" })
      expect(restaurants.body).toHaveLength(1)
      expect(restaurants.body[0].place.name).toContain("Michele")
    }),
  )

  it.effect("performance: 1,000 places within radius stays under 1s", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      // Seed 1,000 points around Naples (~0.01° ≈ 1 km).
      yield* sql`
        insert into places (id, owner_id, name, category, location, source)
        select
          'perf-' || g.i::text,
          ${admin.id},
          'Perf Place ' || g.i::text,
          'restaurant',
          st_setsrid(
            st_makepoint(14.27 + (g.i % 50) * 0.002, 40.85 + (g.i / 50) * 0.002),
            4326
          )::geography,
          'manual'
        from generate_series(1, 1000) as g(i)`.pipe(Effect.orDie)

      const started = Date.now()
      const result = yield* run(async () =>
        search(admin.browser, {
          near: { lat: 40.85, lng: 14.27 },
          radiusKm: 10,
          category: "restaurant",
        }),
      )
      const elapsed = Date.now() - started
      expect(result.status).toBe(200)
      expect(result.body.length).toBeGreaterThan(100)
      expect(elapsed).toBeLessThan(1000)
    }),
  )
})
