import { useCallback, useEffect, useRef, useState } from "react"
import { requestLocation } from "@/lib/geolocation"

export type MapStart = {
  readonly center: { readonly lat: number; readonly lng: number }
  readonly zoom: number
}

/** City-scale provisional view when nothing is cached — not a continent dump. */
const PROVISIONAL: MapStart = { center: { lat: 48.2082, lng: 16.3738 }, zoom: 12 }

const LAST_MAP_KEY = "placard.lastMapStart"
const RECENT_CITIES_KEY = "placard.recentCities"

const isFiniteCoord = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

const parseMapStart = (raw: unknown): MapStart | null => {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const center = record.center
  if (!center || typeof center !== "object") return null
  const { lat, lng } = center as Record<string, unknown>
  const zoom = record.zoom
  if (!isFiniteCoord(lat) || !isFiniteCoord(lng) || !isFiniteCoord(zoom)) return null
  return { center: { lat, lng }, zoom }
}

export const rememberMapStart = (start: MapStart): void => {
  try {
    localStorage.setItem(LAST_MAP_KEY, JSON.stringify(start))
  } catch {
    /* private mode / unavailable storage */
  }
}

const readCachedMapStart = (): MapStart | null => {
  try {
    const raw = localStorage.getItem(LAST_MAP_KEY)
    if (!raw) return null
    return parseMapStart(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

const readRecentCityStart = (): MapStart | null => {
  try {
    const raw = localStorage.getItem(RECENT_CITIES_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    const first = parsed[0] as Record<string, unknown>
    if (!isFiniteCoord(first.lat) || !isFiniteCoord(first.lng)) return null
    return { center: { lat: first.lat, lng: first.lng }, zoom: 12 }
  } catch {
    return null
  }
}

/** Instant center for add maps — never block the first paint on geolocation. */
export const provisionalMapStart = (): MapStart =>
  readCachedMapStart() ?? readRecentCityStart() ?? PROVISIONAL

export type MapStartController = {
  readonly start: MapStart
  readonly locating: boolean
  readonly message: string | null
  readonly locate: () => void
  /** Prefer `{ lock: true }` after the user picks a pin/place so in-flight geo cannot steal the view. */
  readonly commitStart: (start: MapStart, options?: { readonly lock?: boolean }) => void
}

/**
 * Show a map immediately from cache/recent city/provisional center, then refine
 * with geolocation. Failures keep the current view and surface a recovery message.
 */
export const useMapStart = (): MapStartController => {
  const [start, setStart] = useState(provisionalMapStart)
  const [locating, setLocating] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const skipGeoApply = useRef(false)

  const commitStart = useCallback((next: MapStart, options?: { readonly lock?: boolean }) => {
    if (options?.lock) skipGeoApply.current = true
    setStart(next)
    rememberMapStart(next)
  }, [])

  // `attempt` re-runs geolocation when the user taps Use my location.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is a retry trigger, not a value read in the effect
  useEffect(() => {
    let cancelled = false
    setLocating(true)
    setMessage(null)
    void requestLocation().then((result) => {
      if (cancelled) return
      if (skipGeoApply.current) {
        setLocating(false)
        return
      }
      if (result.ok) {
        setStart({ center: { lat: result.lat, lng: result.lng }, zoom: 13 })
        rememberMapStart({ center: { lat: result.lat, lng: result.lng }, zoom: 13 })
        setMessage(null)
      } else {
        setMessage(
          "Couldn't find you — keeping this map view. Zoom in, or try Use my location again.",
        )
      }
      setLocating(false)
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return {
    start,
    locating,
    message,
    locate: () => {
      skipGeoApply.current = false
      setAttempt((n) => n + 1)
    },
    commitStart,
  }
}
