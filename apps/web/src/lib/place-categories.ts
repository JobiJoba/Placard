import type { PlaceCategory } from "@placard/domain"
import { placeCategories } from "@placard/domain"

/** Grouped for the add Type select — fewer simultaneous decisions than a flat 9. */
export const categoryGroups: ReadonlyArray<{
  readonly label: string
  readonly values: ReadonlyArray<PlaceCategory>
}> = [
  { label: "Food & drink", values: ["restaurant", "cafe", "bar"] },
  { label: "Outdoors", values: ["park", "trail"] },
  { label: "Culture", values: ["museum", "cinema"] },
  { label: "Stay", values: ["hotel"] },
  { label: "Other", values: ["other"] },
]

const known = new Set<string>(placeCategories)

export const isPlaceCategory = (value: string): value is PlaceCategory => known.has(value)
