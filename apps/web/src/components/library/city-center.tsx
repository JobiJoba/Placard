import { useEffect, useState } from "react"
import { Link } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { api, errorMessage } from "@/lib/api"

type CityPick = { readonly name: string; readonly lat: number; readonly lng: number }

const RECENT_CITIES_KEY = "placard.recentCities"
const MAX_RECENT_CITIES = 5

const readRecentCities = (): CityPick[] => {
  try {
    const raw = localStorage.getItem(RECENT_CITIES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is CityPick =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as CityPick).name === "string" &&
          typeof (item as CityPick).lat === "number" &&
          typeof (item as CityPick).lng === "number",
      )
      .slice(0, MAX_RECENT_CITIES)
  } catch {
    return []
  }
}

const rememberCity = (city: CityPick) => {
  const next = [city, ...readRecentCities().filter((c) => c.name !== city.name)].slice(
    0,
    MAX_RECENT_CITIES,
  )
  localStorage.setItem(RECENT_CITIES_KEY, JSON.stringify(next))
}

export function CityCenter({
  lat,
  lng,
  cityName,
  mapsReady,
  hasMapsKey,
  onSet,
  onClear,
}: {
  readonly lat: number | null
  readonly lng: number | null
  readonly cityName: string | null
  readonly mapsReady: boolean
  readonly hasMapsKey: boolean
  readonly onSet: (city: CityPick) => void
  readonly onClear: () => void
}) {
  const [query, setQuery] = useState("")
  const [sessionToken] = useState(() => crypto.randomUUID())
  const [suggestions, setSuggestions] = useState<
    ReadonlyArray<{ googlePlaceId: string; primaryText: string; secondaryText: string | null }>
  >([])
  const [loading, setLoading] = useState(false)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<CityPick[]>(() =>
    typeof window === "undefined" ? [] : readRecentCities(),
  )
  const selected =
    lat != null && lng != null
      ? { name: cityName ?? `${lat.toFixed(2)}, ${lng.toFixed(2)}`, lat, lng }
      : null

  useEffect(() => {
    if (!hasMapsKey) return
    const input = query.trim()
    if (input.length < 2) {
      setSuggestions([])
      setLoading(false)
      return
    }
    let stale = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      api((c) =>
        c.google.autocomplete({
          payload: {
            input,
            sessionToken,
            near: null,
            includedPrimaryTypes: ["(cities)"],
          },
        }),
      ).then(
        (found) => {
          if (stale) return
          setSuggestions(found)
          setError(null)
          setLoading(false)
        },
        (cause: unknown) => {
          if (stale) return
          setError(errorMessage(cause))
          setLoading(false)
        },
      )
    }, 250)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [query, sessionToken, hasMapsKey])

  const pickSuggestion = (suggestion: {
    googlePlaceId: string
    primaryText: string
    secondaryText: string | null
  }) => {
    setPicking(true)
    setError(null)
    api((c) =>
      c.google.preview({
        params: { googlePlaceId: suggestion.googlePlaceId },
        query: { sessionToken },
      }),
    ).then(
      (preview) => {
        const city: CityPick = {
          name: suggestion.primaryText,
          lat: preview.location.lat,
          lng: preview.location.lng,
        }
        rememberCity(city)
        setRecent(readRecentCities())
        setQuery("")
        setSuggestions([])
        setPicking(false)
        onSet(city)
      },
      (cause: unknown) => {
        setError(errorMessage(cause))
        setPicking(false)
      },
    )
  }

  if (!mapsReady) {
    return <Skeleton className="h-10 w-full max-w-sm rounded-md" />
  }

  if (!hasMapsKey) {
    return (
      <p className="text-sm text-muted-foreground">
        City search needs a Google Maps API key.{" "}
        <Link to="/settings/integrations" className="underline underline-offset-2">
          Add one in Settings → Integrations
        </Link>
        .
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {selected ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Center:</span>
          <Badge variant="secondary">{selected.name}</Badge>
          <Button type="button" size="sm" variant="ghost" onClick={onClear}>
            Change city
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a city…"
            aria-label="Search for a city"
            autoFocus
          />
          {loading && <p className="text-xs text-muted-foreground">Searching…</p>}
          {picking && <p className="text-xs text-muted-foreground">Setting city…</p>}
          <ErrorAlert message={error} />
          {suggestions.length > 0 && (
            <ul className="flex flex-col rounded-xl ring-1 ring-foreground/10">
              {suggestions.map((suggestion) => (
                <li key={suggestion.googlePlaceId} className="border-b last:border-b-0">
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-muted"
                    disabled={picking}
                    onClick={() => pickSuggestion(suggestion)}
                  >
                    <span className="text-sm font-medium">{suggestion.primaryText}</span>
                    {suggestion.secondaryText && (
                      <span className="text-xs text-muted-foreground">
                        {suggestion.secondaryText}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && query.trim().length >= 2 && suggestions.length === 0 && !error && (
            <p className="text-xs text-muted-foreground">No cities match that name.</p>
          )}
          {recent.length > 0 && query.trim().length === 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Recent:</span>
              {recent.map((city) => (
                <Button
                  key={city.name}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    rememberCity(city)
                    setRecent(readRecentCities())
                    onSet(city)
                  }}
                >
                  {city.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
