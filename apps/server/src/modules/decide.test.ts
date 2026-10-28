import { describe, expect, it } from "@effect/vitest"
import type { Place, SearchHit } from "@placard/domain"
import { excludeRecent } from "@placard/module-restaurants-decide/server"
import { DateTime, Effect, Random } from "effect"

const emptyFacts = {
  openingHours: null,
  phone: null,
  website: null,
  priceLevel: null,
  rating: null,
  cuisine: null,
  types: null,
  fromGoogle: false,
}

const place = (id: string, name: string): Place => ({
  id,
  name,
  category: "restaurant",
  location: { lat: 40.85, lng: 14.25 },
  address: null,
  googlePlaceId: null,
  status: null,
  notes: null,
  source: "manual",
  editedFields: [],
  tags: [],
  listIds: [],
  facts: emptyFacts,
  coverMediaId: null,
  coverThumbUrl: null,
  createdAt: DateTime.makeUnsafe(0),
})

const hit = (id: string, name: string): SearchHit => ({
  place: place(id, name),
  distanceMeters: null,
})

describe("excludeRecent", () => {
  it("keeps places that were not picked recently", () => {
    const pool = [hit("a", "A"), hit("b", "B"), hit("c", "C")]
    expect(excludeRecent(pool, new Set(["b"])).map((h) => h.place.id)).toEqual(["a", "c"])
  })
})

describe("Decide pick", () => {
  it.effect("always picks an index inside the filtered pool", () =>
    Effect.gen(function* () {
      const pool = [hit("a", "A"), hit("b", "B"), hit("c", "C")]
      const filtered = excludeRecent(pool, new Set(["a"]))
      const ids = new Set(filtered.map((h) => h.place.id))
      for (let i = 0; i < 20; i++) {
        const index = yield* Random.nextIntBetween(0, filtered.length, { halfOpen: true })
        const chosen = filtered[index]
        expect(chosen).toBeDefined()
        if (!chosen) return
        expect(ids.has(chosen.place.id)).toBe(true)
      }
    }).pipe(Random.withSeed("decide-pool")),
  )
})
