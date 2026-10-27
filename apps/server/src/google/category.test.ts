import { describe, expect, it } from "@effect/vitest"
import { categoryFromGoogleTypes } from "./category.ts"

describe("categoryFromGoogleTypes", () => {
  it.each([
    ["pizza_restaurant", [], "restaurant"],
    ["restaurant", [], "restaurant"],
    ["coffee_shop", [], "cafe"],
    ["wine_bar", [], "bar"],
    ["national_park", [], "park"],
    ["art_gallery", [], "museum"],
    ["movie_theater", [], "cinema"],
    ["boutique_hotel", [], "hotel"],
    ["lodging", [], "hotel"],
    ["hiking_area", [], "trail"],
    ["dentist", [], "other"],
  ] as const)("maps primary type %s", (primaryType, types, expected) => {
    expect(categoryFromGoogleTypes(primaryType, types)).toBe(expected)
  })

  it("lets the primary type win over broader secondary types", () => {
    expect(categoryFromGoogleTypes("bar", ["restaurant", "food"])).toBe("bar")
  })

  it("falls back to secondary types when the primary type is unknown", () => {
    expect(categoryFromGoogleTypes("tourist_attraction", ["park", "point_of_interest"])).toBe(
      "park",
    )
    expect(categoryFromGoogleTypes(undefined, ["cafe", "food"])).toBe("cafe")
  })

  it("prefers the more specific category among secondary types", () => {
    expect(categoryFromGoogleTypes(undefined, ["restaurant", "movie_theater"])).toBe("cinema")
  })

  it("returns other when nothing matches", () => {
    expect(categoryFromGoogleTypes(undefined, ["point_of_interest", "establishment"])).toBe("other")
  })
})
