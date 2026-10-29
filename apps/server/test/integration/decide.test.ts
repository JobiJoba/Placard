import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { type Browser, TestApp } from "../layers/app.ts"

const password = "correct horse battery"
const decide = (path: string) => `/api/m/restaurants.decide/${path}`

const run = <A>(f: (app: TestApp["Service"]) => Promise<A>) =>
  Effect.gen(function* () {
    const app = yield* TestApp
    return yield* Effect.promise(() => f(app))
  })

layer(TestApp.layer, { concurrent: false, timeout: 120_000 })("decide plugin http", (it) => {
  const admin = { browser: undefined as unknown as Browser }
  const placeIds: string[] = []

  it.effect("setup: sign up and add restaurants", () =>
    run(async (app) => {
      admin.browser = app.browser()
      await admin.browser.send("POST", "/api/auth/sign-up/email", {
        name: "Alice",
        email: "decide@example.com",
        password,
      })
      for (const name of ["Da Michele", "Sorbillo", "Starita"]) {
        const saved = await admin.browser.send("POST", "/api/places/manual", {
          name,
          category: "restaurant",
          location: { lat: 40.85, lng: 14.25 },
          address: null,
        })
        expect(saved.status).toBe(200)
        placeIds.push(saved.body.place.id)
      }
      const park = await admin.browser.send("POST", "/api/places/manual", {
        name: "Tiergarten",
        category: "park",
        location: { lat: 52.51, lng: 13.35 },
        address: null,
      })
      expect(park.status).toBe(200)
    }),
  )

  it.effect("preview counts restaurants only", () =>
    run(async () => {
      const preview = await admin.browser.send("POST", decide("preview"), {
        avoidRecent: false,
      })
      expect(preview.status).toBe(200)
      expect(preview.body.count).toBe(3)
    }),
  )

  it.effect("spin returns a restaurant from the pool and records a pick", () =>
    run(async () => {
      const spun = await admin.browser.send("POST", decide("spin"), {
        avoidRecent: false,
      })
      expect(spun.status).toBe(200)
      expect(placeIds).toContain(spun.body.place.id)
      expect(spun.body.place.category).toBe("restaurant")
    }),
  )

  it.effect("avoid-recent excludes the last pick on the next spin", () =>
    run(async () => {
      const first = await admin.browser.send("POST", decide("spin"), {
        avoidRecent: true,
      })
      expect(first.status).toBe(200)
      const firstId = first.body.place.id as string

      const second = await admin.browser.send("POST", decide("spin"), {
        avoidRecent: true,
      })
      expect(second.status).toBe(200)
      expect(second.body.place.id).not.toBe(firstId)

      await admin.browser.send("POST", decide("spin"), { avoidRecent: true })
      const empty = await admin.browser.send("POST", decide("spin"), {
        avoidRecent: true,
      })
      expect(empty.status).toBe(404)
      expect(empty.body._tag).toBe("DecidePoolEmpty")
    }),
  )

  it.effect("empty pool when filters match nothing", () =>
    run(async () => {
      const empty = await admin.browser.send("POST", decide("spin"), {
        avoidRecent: false,
        tag: "does-not-exist-xyz",
      })
      expect(empty.status).toBe(404)
      expect(empty.body._tag).toBe("DecidePoolEmpty")
      expect(empty.body.message).toMatch(/No restaurants match/i)
    }),
  )
})
