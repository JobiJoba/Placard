import { placeCategories, resolvePlaceCategories } from "@placard/domain"
import { useMemo } from "react"
import { useMe } from "@/session"

export const categoryGroups = [
  {
    label: "Food & drink",
    values: ["restaurant", "cafe", "bakery", "ice_cream", "bar", "brewery", "winery"],
  },
  { label: "Outdoors", values: ["park", "garden", "trail", "beach", "lake", "viewpoint"] },
  { label: "Culture", values: ["museum", "gallery", "cinema", "theatre", "library", "landmark"] },
  { label: "Shopping", values: ["shop", "bookshop", "market"] },
  {
    label: "Activities & wellness",
    values: ["gym", "spa", "swimming_pool", "sports_venue", "zoo", "amusement_park"],
  },
  {
    label: "Stay & travel",
    values: ["hotel", "hostel", "campground", "airport", "train_station", "parking"],
  },
  { label: "Other", values: ["other"] },
] as const

export function usePlaceCategories() {
  const { customPlaceTypes } = useMe()
  return useMemo(() => resolvePlaceCategories(customPlaceTypes), [customPlaceTypes])
}

export function useCategoryGroups() {
  const { customPlaceTypes } = useMe()
  return useMemo(() => {
    const builtins = new Set<string>(placeCategories)
    const values = [...new Set(customPlaceTypes ?? [])].filter((value) => !builtins.has(value))
    return values.length ? [...categoryGroups, { label: "Your types", values }] : categoryGroups
  }, [customPlaceTypes])
}
