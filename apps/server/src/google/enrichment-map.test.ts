import { describe, expect, it } from "@effect/vitest"
import { factsFromGoogle, resolveFacts } from "./enrichment-map.ts"
import placesFixture from "./fixtures/places.json" with { type: "json" }

describe("factsFromGoogle", () => {
  it("maps a full restaurant fixture", () => {
    const place = placesFixture["ChIJ-fixture-da-michele"]
    const facts = factsFromGoogle(place)
    const byKey = Object.fromEntries(facts.map((f) => [f.key, f.value]))
    expect(byKey.phone).toBe("+39 081 553 9204")
    expect(byKey.website).toBe("https://www.damichele.net/")
    expect(byKey.rating).toBe(4.5)
    expect(byKey.price_level).toBe("moderate")
    expect(byKey.cuisine).toBe("Pizza")
    expect(byKey.types).toEqual(place.types)
    expect(byKey.opening_hours).toMatchObject({
      periods: expect.any(Array),
      weekdayDescriptions: expect.any(Array),
    })
  })

  it("tolerates sparse details with only a website", () => {
    const place = placesFixture["ChIJ-fixture-tiergarten"]
    const facts = factsFromGoogle(place)
    expect(facts.map((f) => f.key).sort()).toEqual(["types", "website"])
    expect(facts.find((f) => f.key === "website")?.value).toBe("https://www.berlin.de/en/")
  })

  it("returns nothing for an empty payload", () => {
    expect(factsFromGoogle({})).toEqual([])
  })
})

describe("resolveFacts", () => {
  it("lets a manual override win over Google", () => {
    const facts = resolveFacts([
      {
        key: "phone",
        value: "+39 081 553 9204",
        source: "google",
        is_override: false,
      },
      {
        key: "phone",
        value: "+49 30 123456",
        source: "manual",
        is_override: true,
      },
      {
        key: "website",
        value: "https://www.damichele.net/",
        source: "google",
        is_override: false,
      },
    ])
    expect(facts.phone).toBe("+49 30 123456")
    expect(facts.website).toBe("https://www.damichele.net/")
    expect(facts.fromGoogle).toBe(true)
  })

  it("marks fromGoogle false when every fact is manual", () => {
    const facts = resolveFacts([
      { key: "phone", value: "555", source: "manual", is_override: true },
    ])
    expect(facts.fromGoogle).toBe(false)
    expect(facts.phone).toBe("555")
  })
})
