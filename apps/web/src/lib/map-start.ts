import { requestLocation } from "@/lib/geolocation"

export type MapStart = {
  readonly center: { readonly lat: number; readonly lng: number }
  readonly zoom: number
}

const FALLBACK: MapStart = { center: { lat: 48.2, lng: 16.37 }, zoom: 3 }

/** Prefer the user's location for add-map defaults; fall back to a wide Europe view. */
export const resolveMapStart = async (): Promise<MapStart> => {
  const result = await requestLocation()
  if (result.ok) return { center: { lat: result.lat, lng: result.lng }, zoom: 13 }
  return FALLBACK
}
