import type { PlacePreview, PlaceSuggestion } from "@placard/domain"
import { Search } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { ErrorAlert } from "@/components/error-alert"
import { Input } from "@/components/ui/input"
import { api, errorMessage } from "@/lib/api"
import { GooglePreviewCard, newSessionToken } from "./google-preview"

const MIN_INPUT = 2
const DEBOUNCE_MS = 250

export function SearchAdd() {
  const inputId = useId()
  const [sessionToken] = useState(newSessionToken)
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<ReadonlyArray<PlaceSuggestion>>([])
  const [preview, setPreview] = useState<PlacePreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const input = query.trim()
    if (input.length < MIN_INPUT) {
      setSuggestions([])
      return
    }
    let stale = false
    const timer = setTimeout(() => {
      api((c) => c.google.autocomplete({ payload: { input, sessionToken, near: null } })).then(
        (found) => {
          if (stale) return
          setSuggestions(found)
          setError(null)
        },
        (cause: unknown) => !stale && setError(errorMessage(cause)),
      )
    }, DEBOUNCE_MS)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [query, sessionToken])

  const choose = (suggestion: PlaceSuggestion) => {
    setSuggestions([])
    setPreview(null)
    api((c) =>
      c.google.preview({
        params: { googlePlaceId: suggestion.googlePlaceId },
        query: { sessionToken },
      }),
    ).then(setPreview, (cause: unknown) => setError(errorMessage(cause)))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <label htmlFor={inputId} className="sr-only">
          Search Google Maps
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={inputId}
          className="pl-8"
          placeholder="Search for a restaurant, park, museum…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setPreview(null)
          }}
          autoComplete="off"
          autoFocus
        />
      </div>
      <ErrorAlert message={error} />
      {suggestions.length > 0 && (
        <ul aria-label="Suggestions" className="flex flex-col rounded-xl ring-1 ring-foreground/10">
          {suggestions.map((suggestion) => (
            <li key={suggestion.googlePlaceId} className="border-b last:border-b-0">
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                onClick={() => choose(suggestion)}
              >
                <span className="text-sm font-medium">{suggestion.primaryText}</span>
                {suggestion.secondaryText && (
                  <span className="text-xs text-muted-foreground">{suggestion.secondaryText}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {preview && (
        <GooglePreviewCard preview={preview} source="autocomplete" sessionToken={sessionToken} />
      )}
    </div>
  )
}
