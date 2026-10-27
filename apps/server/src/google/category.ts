import type { PlaceCategory } from "@placard/domain"

/** Checked in order, so more specific categories win over broad ones like `restaurant`. */
const rules: ReadonlyArray<readonly [PlaceCategory, (type: string) => boolean]> = [
  ["cinema", (t) => t === "movie_theater"],
  ["museum", (t) => t === "museum" || t === "art_gallery"],
  ["trail", (t) => t === "hiking_area"],
  ["park", (t) => t === "park" || t === "national_park" || t === "botanical_garden"],
  ["hotel", (t) => t === "lodging" || t.endsWith("_hotel") || t === "hotel" || t === "hostel"],
  ["bar", (t) => t === "bar" || t === "pub" || t === "wine_bar" || t === "night_club"],
  ["cafe", (t) => t === "cafe" || t === "coffee_shop" || t === "tea_house" || t === "bakery"],
  ["restaurant", (t) => t === "restaurant" || t.endsWith("_restaurant") || t === "meal_takeaway"],
]

/**
 * Maps Google's place types to a Placard category. The primary type decides
 * when it matches a rule; otherwise the first matching secondary type does.
 */
export const categoryFromGoogleTypes = (
  primaryType: string | undefined,
  types: ReadonlyArray<string>,
): PlaceCategory => {
  const match = (type: string) => rules.find(([, test]) => test(type))?.[0]
  const fromPrimary = primaryType ? match(primaryType) : undefined
  if (fromPrimary) return fromPrimary
  for (const [category, test] of rules) {
    if (types.some(test)) return category
  }
  return "other"
}
