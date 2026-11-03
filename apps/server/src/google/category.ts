import type { PlaceCategory } from "@placard/domain"

/** Checked in order, so more specific categories win over broad ones like `restaurant`. */
const rules: ReadonlyArray<readonly [PlaceCategory, (type: string) => boolean]> = [
  ["bakery", (t) => t === "bakery"],
  ["ice_cream", (t) => t === "ice_cream_shop"],
  ["brewery", (t) => t === "brewery"],
  ["winery", (t) => t === "winery" || t === "vineyard"],
  ["gallery", (t) => t === "art_gallery"],
  ["theatre", (t) => t === "performing_arts_theater"],
  ["library", (t) => t === "library"],
  ["landmark", (t) => t === "historical_landmark" || t === "monument"],
  ["beach", (t) => t === "beach"],
  ["garden", (t) => t === "botanical_garden" || t === "garden"],
  ["viewpoint", (t) => t === "observation_deck" || t === "scenic_spot"],
  ["lake", (t) => t === "lake"],
  ["campground", (t) => t === "campground" || t === "rv_park"],
  ["hostel", (t) => t === "hostel"],
  ["bookshop", (t) => t === "book_store"],
  ["market", (t) => t === "market" || t === "farmers_market"],
  ["gym", (t) => t === "gym" || t === "fitness_center"],
  ["spa", (t) => t === "spa" || t === "wellness_center"],
  ["swimming_pool", (t) => t === "swimming_pool"],
  ["sports_venue", (t) => t === "stadium" || t === "sports_complex"],
  ["zoo", (t) => t === "zoo" || t === "aquarium"],
  ["amusement_park", (t) => t === "amusement_park" || t === "amusement_center"],
  ["airport", (t) => t === "airport" || t === "international_airport"],
  ["train_station", (t) => t === "train_station" || t === "transit_station"],
  ["parking", (t) => t === "parking"],
  ["cinema", (t) => t === "movie_theater"],
  ["museum", (t) => t === "museum"],
  ["trail", (t) => t === "hiking_area"],
  ["park", (t) => t === "park" || t === "national_park"],
  ["hotel", (t) => t === "lodging" || t.endsWith("_hotel") || t === "hotel"],
  ["bar", (t) => t === "bar" || t === "pub" || t === "wine_bar" || t === "night_club"],
  ["cafe", (t) => t === "cafe" || t === "coffee_shop" || t === "tea_house"],
  ["restaurant", (t) => t === "restaurant" || t.endsWith("_restaurant") || t === "meal_takeaway"],
  ["shop", (t) => t === "store" || t.endsWith("_store") || t === "shopping_mall"],
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
