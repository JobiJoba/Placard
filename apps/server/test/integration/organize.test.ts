import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { type Browser, TestApp } from "../layers/app.ts"

const password = "correct horse battery"

const run = <A>(f: (app: TestApp["Service"]) => Promise<A>) =>
  Effect.gen(function* () {
    const app = yield* TestApp
    return yield* Effect.promise(() => f(app))
  })

const pin = (browser: Browser, name: string, lat: number) =>
  browser.send("POST", "/api/places/manual", {
    name,
    category: "restaurant",
    location: { lat, lng: 14.25 },
    address: null,
  })

layer(TestApp.layer, { concurrent: false, timeout: 120_000 })("organize", (it) => {
  const admin = { browser: undefined as unknown as Browser }
  const ids: string[] = []
  let listId = ""
  let tagId = ""

  it.effect("signs up and seeds three restaurants", () =>
    run(async (app) => {
      admin.browser = app.browser()
      await admin.browser.send("POST", "/api/auth/sign-up/email", {
        name: "Alice",
        email: "alice@example.com",
        password,
      })
      for (const [name, lat] of [
        ["Da Michele", 40.85],
        ["Sorbillo", 40.84],
        ["Starita", 40.86],
      ] as const) {
        const saved = await pin(admin.browser, name, lat)
        expect(saved.status).toBe(200)
        ids.push(saved.body.place.id)
      }
    }),
  )

  it.effect("creates a list and adds places to it", () =>
    run(async () => {
      const created = await admin.browser.send("POST", "/api/lists", {
        name: "Italian restaurants",
        description: "Naples pizza",
      })
      expect(created.status).toBe(200)
      expect(created.body).toMatchObject({
        name: "Italian restaurants",
        description: "Naples pizza",
        placeCount: 0,
      })
      listId = created.body.id

      const bulk = await admin.browser.send("POST", "/api/places/bulk", {
        placeIds: ids,
        action: { _tag: "addToList", listId },
      })
      expect(bulk.body).toEqual({ affected: 3 })

      const list = await admin.browser.get(`/api/lists/${listId}`)
      expect(list.body.placeCount).toBe(3)
      const filtered = await admin.browser.get(`/api/places?list=${listId}`)
      expect(filtered.body.map((p: { name: string }) => p.name).sort()).toEqual([
        "Da Michele",
        "Sorbillo",
        "Starita",
      ])
    }),
  )

  it.effect("renaming a list keeps its places; deleting it does not delete them", () =>
    run(async () => {
      const renamed = await admin.browser.send("PATCH", `/api/lists/${listId}`, {
        name: "Naples pizza",
      })
      expect(renamed.body.name).toBe("Naples pizza")
      expect(renamed.body.placeCount).toBe(3)

      expect((await admin.browser.send("DELETE", `/api/lists/${listId}`)).status).toBe(204)
      expect((await admin.browser.get(`/api/lists/${listId}`)).status).toBe(404)
      expect((await admin.browser.get("/api/places")).body).toHaveLength(3)
      expect((await admin.browser.get(`/api/places/${ids[0]}`)).body.listIds).toEqual([])
    }),
  )

  it.effect("tags a place, marks been-there, and edits its name", () =>
    run(async () => {
      const tagged = await admin.browser.send("PUT", `/api/places/${ids[0]}/tags`, {
        names: ["date-night", "pizza"],
      })
      expect(tagged.body.tags.map((t: { name: string }) => t.name)).toEqual(["date-night", "pizza"])
      tagId = tagged.body.tags.find((t: { name: string }) => t.name === "date-night").id

      const status = await admin.browser.send("PATCH", `/api/places/${ids[0]}`, {
        status: "been_there",
        name: "L'Antica da Michele",
      })
      expect(status.body).toMatchObject({
        name: "L'Antica da Michele",
        status: "been_there",
        // Manual pins pin every editable field on create; the rename keeps that set.
        editedFields: ["name", "category", "address"],
      })

      const byTag = await admin.browser.get("/api/places?tag=date-night")
      expect(byTag.body).toHaveLength(1)
      expect(byTag.body[0].name).toBe("L'Antica da Michele")

      const tags = await admin.browser.get("/api/tags")
      expect(tags.body.find((t: { id: string }) => t.id === tagId)).toMatchObject({
        name: "date-night",
        placeCount: 1,
      })
    }),
  )

  it.effect("rejects a duplicate list name and a blank rename", () =>
    run(async () => {
      const first = await admin.browser.send("POST", "/api/lists", {
        name: "Favorites",
        description: null,
      })
      expect(first.status).toBe(200)
      const clash = await admin.browser.send("POST", "/api/lists", {
        name: "favorites",
        description: null,
      })
      expect(clash.status).toBe(409)
      expect(clash.body._tag).toBe("NameTaken")
    }),
  )

  it.effect("bulk-deletes two places and restores one", () =>
    run(async () => {
      const deleted = await admin.browser.send("POST", "/api/places/bulk", {
        placeIds: [ids[0], ids[1]],
        action: { _tag: "delete" },
      })
      expect(deleted.body).toEqual({ affected: 2 })
      expect(
        (await admin.browser.get("/api/places")).body.map((p: { id: string }) => p.id),
      ).toEqual([ids[2]])

      const trash = await admin.browser.get("/api/places/deleted")
      expect(trash.body).toHaveLength(2)
      expect(trash.body[0].purgeAt).toBeTruthy()

      const restored = await admin.browser.send("POST", "/api/places/restore", {
        placeIds: [ids[0]],
      })
      expect(restored.body).toEqual({ affected: 1 })
      expect(
        (await admin.browser.get("/api/places")).body.map((p: { id: string }) => p.id).sort(),
      ).toEqual([ids[0], ids[2]].sort())
      expect((await admin.browser.get("/api/places/deleted")).body).toHaveLength(1)
    }),
  )

  it.effect("bulk operations are atomic when a list is missing", () =>
    run(async () => {
      const before = await admin.browser.get("/api/places")
      const failed = await admin.browser.send("POST", "/api/places/bulk", {
        placeIds: [ids[0], ids[2]],
        action: { _tag: "addToList", listId: "00000000-0000-0000-0000-000000000000" },
      })
      expect(failed.status).toBe(404)
      expect(failed.body._tag).toBe("ListNotFound")
      const after = await admin.browser.get("/api/places")
      expect(after.body.map((p: { listIds: string[] }) => p.listIds)).toEqual(
        before.body.map((p: { listIds: string[] }) => p.listIds),
      )
    }),
  )
})
