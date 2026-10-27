export type GeoSource = "browser" | "ip"

export type GeoResult =
  | {
      readonly ok: true
      readonly lat: number
      readonly lng: number
      readonly source: GeoSource
    }
  | {
      readonly ok: false
      readonly message: string
      readonly errorCode?: number
    }

const messageFor = (error: GeolocationPositionError): string => {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location permission is blocked. Allow it for this site in the browser address bar, and in macOS System Settings → Privacy & Security → Location Services for your browser."
    case error.POSITION_UNAVAILABLE:
      return "This browser couldn't resolve a precise position."
    case error.TIMEOUT:
      return "Timed out waiting for a position. Try again, or pick City / All."
    default:
      return "Couldn't get your location. Try again, or pick City / All."
  }
}

const readOnce = (options: PositionOptions): Promise<GeoResult> =>
  new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({
        ok: false,
        message: "This browser can't share your location.",
      })
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          ok: true,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          source: "browser",
        })
      },
      (error) => {
        resolve({
          ok: false,
          message: messageFor(error),
          errorCode: error.code,
        })
      },
      options,
    )
  })

/** Coarse public-IP location when the browser's network provider fails (Chromium 403). */
const readIpFallback = async (): Promise<GeoResult> => {
  try {
    const response = await fetch("https://get.geojs.io/v1/ip/geo.json", {
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = (await response.json()) as { latitude?: string; longitude?: string }
    const lat = Number(body.latitude)
    const lng = Number(body.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error("missing coordinates")
    }
    return { ok: true, lat, lng, source: "ip" }
  } catch {
    return {
      ok: false,
      message:
        "Couldn't get your location. This browser's network location service failed. Pick City / All, or try Brave/Safari/Chrome.",
    }
  }
}

const isUnavailable = (result: GeoResult): boolean =>
  !result.ok && result.errorCode === 2

/** Share one in-flight lookup (React Strict Mode mounts effects twice in dev). */
let inFlight: Promise<GeoResult> | null = null

/**
 * Prefer a recent cached fix, then a fresh reading, then a coarse IP fallback
 * when Chromium's Google network-location provider returns 403.
 */
export const requestLocation = (): Promise<GeoResult> => {
  if (inFlight) return inFlight
  inFlight = requestLocationOnce().finally(() => {
    inFlight = null
  })
  return inFlight
}

const requestLocationOnce = async (): Promise<GeoResult> => {
  if (!window.isSecureContext) {
    return {
      ok: false,
      message:
        "Browsers only share location on HTTPS or localhost. Open the app via https://localhost:5173.",
    }
  }

  const cached = await readOnce({
    enableHighAccuracy: false,
    maximumAge: 5 * 60_000,
    timeout: 8_000,
  })
  if (cached.ok) return cached

  // Dia/Chromium often fail immediately with googleapis 403 → POSITION_UNAVAILABLE.
  if (isUnavailable(cached)) return readIpFallback()

  const fresh = await readOnce({
    enableHighAccuracy: false,
    maximumAge: 0,
    timeout: 12_000,
  })
  if (fresh.ok) return fresh
  if (isUnavailable(fresh)) return readIpFallback()

  return {
    ok: false,
    message: !fresh.ok ? fresh.message : "Couldn't get your location.",
    errorCode: !fresh.ok ? fresh.errorCode : undefined,
  }
}
