import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { type Browser, TestApp } from "../layers/app.ts"

const password = "correct horse battery"
const SESSION = "0b6a3c2e-6f4e-4a1f-9a55-6c1a1e0f2d11"
const MICHELE = "ChIJ-fixture-da-michele"
const TIER = "ChIJ-fixture-tiergarten"

const run = <A>(f: (app: TestApp["Service"]) => Promise<A>) =>
  Effect.gen(function* () {
    const app = yield* TestApp
    return yield* Effect.promise(() => f(app))
  })

layer(TestApp.layer, { concurrent: false, timeout: 120_000 })("enrichment", (it) => {
  const admin = { browser: undefined as unknown as Browser, id: "" }
  let micheleId = ""

  it.effect("setup: sign up and set a Google key", () =>
    run(async (app) => {
      admin.browser = app.browser()
      await admin.browser.send("POST", "/api/auth/sign-up/email", {
        name: "Enricher",
        email: "enrich@example.com",
        password,
      })
      admin.id = (await admin.browser.get("/api/me")).body.id
      const key = await admin.browser.send("PUT", "/api/admin/settings/google-api-key", {
        apiKey: "fixture-key",
      })
      expect(key.status).toBe(200)
    }),
  )

  it.effect("saving a place stores facts from the Google details call", () =>
    run(async () => {
      const saved = await admin.browser.send("POST", "/api/places/google", {
        googlePlaceId: MICHELE,
        source: "autocomplete",
        sessionToken: SESSION,
      })
      expect(saved.status).toBe(200)
      micheleId = saved.body.place.id
      expect(saved.body.place.facts).toMatchObject({
        phone: "+39 081 553 9204",
        website: "https://www.damichele.net/",
        rating: 4.5,
        priceLevel: "moderate",
        cuisine: "Pizza",
        fromGoogle: true,
      })
      expect(saved.body.place.facts.openingHours?.weekdayDescriptions?.length).toBeGreaterThan(0)
    }),
  )

  it.effect("a manual phone override and edited name survive merge refresh", () =>
    run(async () => {
      const overridden = await admin.browser.send("PUT", `/api/places/${micheleId}/facts/phone`, {
        value: "+49 30 999999",
      })
      expect(overridden.status).toBe(200)
      expect(overridden.body.facts.phone).toBe("+49 30 999999")

      const renamed = await admin.browser.send("PATCH", `/api/places/${micheleId}`, {
        name: "My Michele",
      })
      expect(renamed.status).toBe(200)
      expect(renamed.body.name).toBe("My Michele")
      expect(renamed.body.editedFields).toContain("name")

      const refreshed = await admin.browser.send("POST", `/api/places/${micheleId}/refresh`, {
        mode: "merge",
      })
      expect(refreshed.status).toBe(200)
      expect(refreshed.body.facts.phone).toBe("+49 30 999999")
      expect(refreshed.body.name).toBe("My Michele")
      expect(refreshed.body.editedFields).toContain("name")
      expect(refreshed.body.facts.website).toBe("https://www.damichele.net/")
      expect(refreshed.body.facts.fromGoogle).toBe(true)
    }),
  )

  it.effect("replace refresh clears overrides and edited fields, keeps notes", () =>
    run(async () => {
      const noted = await admin.browser.send("PATCH", `/api/places/${micheleId}`, {
        notes: "Keep this note",
      })
      expect(noted.status).toBe(200)
      expect(noted.body.notes).toBe("Keep this note")

      const replaced = await admin.browser.send("POST", `/api/places/${micheleId}/refresh`, {
        mode: "replace",
      })
      expect(replaced.status).toBe(200)
      expect(replaced.body.facts.phone).toBe("+39 081 553 9204")
      expect(replaced.body.name).toBe("L'Antica Pizzeria da Michele")
      expect(replaced.body.editedFields).toEqual([])
      expect(replaced.body.notes).toBe("Keep this note")
      expect(replaced.body.facts.website).toBe("https://www.damichele.net/")
      expect(replaced.body.facts.fromGoogle).toBe(true)
    }),
  )

  it.effect("clearing the override restores the Google phone", () =>
    run(async () => {
      const overridden = await admin.browser.send("PUT", `/api/places/${micheleId}/facts/phone`, {
        value: "+49 30 111",
      })
      expect(overridden.status).toBe(200)

      const cleared = await admin.browser.send("DELETE", `/api/places/${micheleId}/facts/phone`)
      expect(cleared.status).toBe(200)
      expect(cleared.body.facts.phone).toBe("+39 081 553 9204")
    }),
  )

  it.effect(
    "force refresh all reports the call count, starts a run, and rejects a second start",
    () =>
      Effect.gen(function* () {
        yield* run(async () => {
          await admin.browser.send("POST", "/api/places/google", {
            googlePlaceId: TIER,
            source: "map_pick",
            sessionToken: null,
          })
        })

        const plan = yield* run(async () => admin.browser.get("/api/admin/enrichment/plan"))
        expect(plan.body.placeCount).toBe(2)

        const started = yield* run(async () =>
          admin.browser.send("POST", "/api/admin/enrichment/refresh-all"),
        )
        expect(started.status).toBe(200)
        expect(started.body).toMatchObject({ status: "running", total: 2, completed: 0, failed: 0 })

        const current = yield* run(async () => admin.browser.get("/api/admin/enrichment/run"))
        expect(current.body?.id).toBe(started.body.id)

        const busy = yield* run(async () =>
          admin.browser.send("POST", "/api/admin/enrichment/refresh-all"),
        )
        expect(busy.status).toBe(409)
        expect(busy.body._tag).toBe("EnrichmentBusy")

        // Simulate the worker finishing both jobs so later suites aren't stuck.
        const sql = yield* SqlClient.SqlClient
        yield* sql`
        update enrichment_runs set
          completed = total, status = 'done', finished_at = now()
        where id = ${started.body.id}`.pipe(Effect.orDie)
      }),
  )
})
