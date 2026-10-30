import {
  appleMapsUrl,
  googleMapsUrl,
  organicMapsUrl,
  type Place,
} from "@placard/domain"
import { useEffect, useState } from "react"

export const MAPS_PROVIDERS = ["google", "apple", "organic"] as const
export type MapsProvider = (typeof MAPS_PROVIDERS)[number]

export const DEFAULT_MAPS_PROVIDER: MapsProvider = "google"

export const mapsProviderLabels: Record<MapsProvider, string> = {
  google: "Google Maps",
  apple: "Apple Maps",
  organic: "Organic Maps",
}

/** Short label for primary CTA (“Open in Google Maps”). */
export const mapsProviderOpenLabels: Record<MapsProvider, string> = {
  google: "Open in Google Maps",
  apple: "Open in Apple Maps",
  organic: "Open in Organic Maps",
}

type LinkablePlace = Pick<Place, "name" | "location" | "address" | "googlePlaceId">

const STORAGE_KEY = "placard.mapsProvider"
const CHANGE_EVENT = "placard:maps-provider"

export function isMapsProvider(value: unknown): value is MapsProvider {
  return value === "google" || value === "apple" || value === "organic"
}

export function readMapsProvider(): MapsProvider {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (isMapsProvider(raw)) return raw
  } catch {
    /* private mode / unavailable storage */
  }
  return DEFAULT_MAPS_PROVIDER
}

export function writeMapsProvider(provider: MapsProvider): void {
  try {
    localStorage.setItem(STORAGE_KEY, provider)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** Device-local preferred maps app for place detail / Decide. */
export function useMapsProvider(): readonly [MapsProvider, (provider: MapsProvider) => void] {
  const [provider, setProviderState] = useState(readMapsProvider)

  useEffect(() => {
    const sync = () => setProviderState(readMapsProvider())
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const setProvider = (next: MapsProvider) => {
    writeMapsProvider(next)
    setProviderState(next)
  }

  return [provider, setProvider] as const
}

export function mapsUrlFor(provider: MapsProvider, place: LinkablePlace): string {
  switch (provider) {
    case "google":
      return googleMapsUrl(place)
    case "apple":
      return appleMapsUrl(place)
    case "organic":
      return organicMapsUrl(place)
  }
}

export function orderedMapsProviders(preferred: MapsProvider): ReadonlyArray<MapsProvider> {
  return [preferred, ...MAPS_PROVIDERS.filter((p) => p !== preferred)]
}
