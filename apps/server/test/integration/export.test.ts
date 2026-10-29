import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { unzipSync } from "fflate"
import { type Browser, TestApp } from "../layers/app.ts"

/** 1×1 PNG */
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

const password = "correct horse battery"

const run = <A>(f: (app: TestApp["Service"]) => Promise<A>) =>
  Effect.gen(function* () {
    const app = yield* TestApp
    return yield* Effect.promise(() => f(app))
  })

layer(TestApp.layer, { concurrent: false, timeout: 120_000 })("library export", (it) => {
  it.effect("exports placard.json, library.geojson, and media for the signed-in user", () =>
    run(async (app) => {
      const browser: Browser = app.browser()
      expect(
        (
          await browser.send("POST", "/api/auth/sign-up/email", {
            name: "Alice",
            email: "alice-export@example.com",
            password,
          })
        ).status,
      ).toBe(200)

      const saved = await browser.send("POST", "/api/places/manual", {
        name: "Da Michele",
        category: "restaurant",
        location: { lat: 40.85, lng: 14.25 },
        address: "Via Cesare Sersale",
      })
      expect(saved.status).toBe(200)
      const placeId = saved.body.place.id as string

      const list = await browser.send("POST", "/api/lists", {
        name: "Naples",
        description: null,
      })
      expect(list.status).toBe(200)
      const listId = list.body.id as string
      expect(
        (
          await browser.send("POST", "/api/places/bulk", {
            placeIds: [placeId],
            action: { _tag: "addToList", listId },
          })
        ).status,
      ).toBe(200)

      const tagged = await browser.send("PUT", `/api/places/${placeId}/tags`, {
        names: ["pizza"],
      })
      expect(tagged.status).toBe(200)

      const uploaded = await browser.send("POST", `/api/media/places/${placeId}`, {
        kind: "dish",
        caption: "Margherita",
        filename: "pizza.png",
        mimeType: "image/png",
        contentBase64: TINY_PNG,
      })
      expect(uploaded.status).toBe(200)
      const mediaId = uploaded.body.id as string

      const raw = await browser.getRaw("/api/export")
      expect(raw.status).toBe(200)
      expect(raw.contentType).toMatch(/zip/)

      const files = unzipSync(raw.body)
      const names = Object.keys(files).sort()
      expect(names).toContain("placard.json")
      expect(names).toContain("library.geojson")
      expect(names).toContain("media/manifest.json")
      expect(names.some((n) => n.startsWith(`media/${mediaId}.`))).toBe(true)

      const document = JSON.parse(new TextDecoder().decode(files["placard.json"]))
      expect(document.version).toBe(1)
      expect(document.places).toHaveLength(1)
      expect(document.places[0].id).toBe(placeId)
      expect(document.places[0].listIds).toContain(listId)
      expect(document.lists.some((l: { id: string }) => l.id === listId)).toBe(true)
      expect(document.tags.some((t: { name: string }) => t.name === "pizza")).toBe(true)
      expect(document.media).toHaveLength(1)
      expect(document.media[0].id).toBe(mediaId)

      const geo = JSON.parse(new TextDecoder().decode(files["library.geojson"]))
      expect(geo.type).toBe("FeatureCollection")
      expect(geo.features).toHaveLength(1)
      expect(geo.features[0].properties.id).toBe(placeId)
      expect(geo.features[0].geometry.coordinates).toEqual([14.25, 40.85])
    }),
  )

  it.effect("requires authentication", () =>
    run(async (app) => {
      const raw = await app.browser().getRaw("/api/export")
      expect(raw.status).toBe(401)
    }),
  )
})
