import {
  type FactKey,
  type OpeningHours,
  type PlaceFacts,
  type PriceLevel,
} from "@placard/domain"

const priceLevelMap: Record<string, PriceLevel> = {
  PRICE_LEVEL_FREE: "free",
  PRICE_LEVEL_INEXPENSIVE: "inexpensive",
  PRICE_LEVEL_MODERATE: "moderate",
  PRICE_LEVEL_EXPENSIVE: "expensive",
  PRICE_LEVEL_VERY_EXPENSIVE: "very_expensive",
}

const cuisineSuffixes = ["_restaurant", "_cafe", "_bakery"]
const skipTypes = new Set([
  "food",
  "point_of_interest",
  "establishment",
  "restaurant",
  "cafe",
  "bar",
  "meal_takeaway",
  "meal_delivery",
])

export interface GoogleEnrichmentFields {
  readonly nationalPhoneNumber?: string
  readonly internationalPhoneNumber?: string
  readonly websiteUri?: string
  readonly rating?: number
  readonly priceLevel?: string
  readonly types?: ReadonlyArray<string>
  readonly primaryType?: string
  readonly regularOpeningHours?: {
    readonly periods?: ReadonlyArray<{
      readonly open: { readonly day: number; readonly hour: number; readonly minute: number }
      readonly close?: { readonly day: number; readonly hour: number; readonly minute: number }
    }>
    readonly weekdayDescriptions?: ReadonlyArray<string>
  }
}

export interface MappedFact {
  readonly key: FactKey
  readonly value: unknown
}

const cuisineFrom = (primaryType: string | undefined, types: ReadonlyArray<string>): string | null => {
  const candidates = [primaryType, ...types].filter((t): t is string => Boolean(t))
  for (const type of candidates) {
    if (skipTypes.has(type)) continue
    for (const suffix of cuisineSuffixes) {
      if (type.endsWith(suffix)) {
        return type
          .slice(0, -suffix.length)
          .split("_")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ")
      }
    }
  }
  return null
}

const openingHoursFrom = (
  hours: GoogleEnrichmentFields["regularOpeningHours"],
): OpeningHours | null => {
  if (!hours?.periods?.length) return null
  return {
    periods: hours.periods.map((period) => ({
      open: period.open,
      ...(period.close ? { close: period.close } : {}),
    })),
    ...(hours.weekdayDescriptions ? { weekdayDescriptions: [...hours.weekdayDescriptions] } : {}),
  }
}

/** Turns a Google Place Details payload into the fact rows Placard stores. */
export const factsFromGoogle = (place: GoogleEnrichmentFields): ReadonlyArray<MappedFact> => {
  const facts: MappedFact[] = []
  const phone = place.internationalPhoneNumber ?? place.nationalPhoneNumber
  if (phone) facts.push({ key: "phone", value: phone })
  if (place.websiteUri) facts.push({ key: "website", value: place.websiteUri })
  if (place.rating !== undefined) facts.push({ key: "rating", value: place.rating })
  const price = place.priceLevel ? priceLevelMap[place.priceLevel] : undefined
  if (price) facts.push({ key: "price_level", value: price })
  const types = place.types ?? []
  if (types.length > 0) facts.push({ key: "types", value: [...types] })
  const cuisine = cuisineFrom(place.primaryType, types)
  if (cuisine) facts.push({ key: "cuisine", value: cuisine })
  const hours = openingHoursFrom(place.regularOpeningHours)
  if (hours) facts.push({ key: "opening_hours", value: hours })
  return facts
}

export const emptyFacts = (): PlaceFacts => ({
  openingHours: null,
  phone: null,
  website: null,
  priceLevel: null,
  rating: null,
  cuisine: null,
  types: null,
  fromGoogle: false,
})

/** Resolve effective facts: a manual override wins over the Google value. */
export const resolveFacts = (
  rows: ReadonlyArray<{
    readonly key: string
    readonly value: unknown
    readonly source: string
    readonly is_override: boolean
  }>,
): PlaceFacts => {
  const byKey = new Map<string, { value: unknown; fromGoogle: boolean }>()
  for (const row of rows) {
    if (row.is_override || row.source === "manual") {
      byKey.set(row.key, { value: row.value, fromGoogle: false })
      continue
    }
    if (!byKey.has(row.key) && row.source === "google") {
      byKey.set(row.key, { value: row.value, fromGoogle: true })
    }
  }
  const get = <T>(key: FactKey): T | null => (byKey.get(key)?.value as T | undefined) ?? null
  return {
    openingHours: get("opening_hours"),
    phone: get("phone"),
    website: get("website"),
    priceLevel: get("price_level"),
    rating: get("rating"),
    cuisine: get("cuisine"),
    types: get("types"),
    fromGoogle: [...byKey.values()].some((entry) => entry.fromGoogle),
  }
}
