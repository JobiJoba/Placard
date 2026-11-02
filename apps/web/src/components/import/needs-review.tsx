import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api, errorMessage } from "@/lib/api"
import { useLoad } from "@/lib/use-load"

import { listLabel } from "./entry-labels"
export function NeedsReviewSection({
  runId,
  matched,
  needsReview,
  busy,
  setBusy,
  setError,
  onChanged,
}: {
  readonly runId: string
  readonly matched: number
  readonly needsReview: number
  readonly busy: boolean
  readonly setBusy: (value: boolean) => void
  readonly setError: (value: string | null) => void
  readonly onChanged: () => Promise<void>
}) {
  const loadReview = useCallback(
    () =>
      api((c) =>
        c.import.listEntries({
          params: { id: runId },
          payload: { matchStatus: "needs_review" },
        }),
      ),
    [runId],
  )
  const { data: reviewEntries, reload } = useLoad(loadReview)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  const entries = reviewEntries ?? []
  const withPin = entries.filter((e) => e.placeId)
  const selectedWithPin = withPin.filter((e) => selected.has(e.id))
  const allSelected = entries.length > 0 && entries.every((e) => selected.has(e.id))

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      setResolvingId(null)
      setSelected(new Set())
      await Promise.all([reload(), onChanged()])
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(entries.map((e) => e.id)))
  }

  const bulkAccept = () => {
    const ids = selectedWithPin.map((e) => e.id)
    if (ids.length === 0) return
    if (!window.confirm(`Accept weak pins for ${ids.length} selected entries?`)) return
    void act(async () => {
      for (const entryId of ids) {
        await api((c) => c.import.acceptReview({ params: { id: runId, entryId } }))
      }
    })
  }

  const bulkSkip = () => {
    const ids = [...selected]
    if (ids.length === 0) return
    if (!window.confirm(`Skip ${ids.length} selected entries?`)) return
    void act(async () => {
      for (const entryId of ids) {
        await api((c) => c.import.dismissReview({ params: { id: runId, entryId } }))
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Import finished. Matched {matched}, needs review {needsReview}.{" "}
        <Link to="/" className="underline underline-offset-4">
          Open library
        </Link>
      </p>

      {needsReview > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div>
            <h2 className="text-lg font-medium">Needs review</h2>
            <p className="text-xs text-muted-foreground">
              These kept entries had no reliable location or Google match. Search Google to place
              them, accept a weak pin if one was created, or skip.
            </p>
          </div>
          {entries.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                Select all ({entries.length})
              </label>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || selectedWithPin.length === 0}
                onClick={bulkAccept}
              >
                Accept pins ({selectedWithPin.length})
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || selected.size === 0}
                onClick={bulkSkip}
              >
                Skip selected ({selected.size})
              </Button>
            </div>
          )}
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-md border border-border/70 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(entry.id)}
                      onChange={() => toggle(entry.id)}
                      aria-label={`Select ${entry.name ?? "entry"}`}
                    />
                    <div>
                      <p className="font-medium">{entry.name ?? "(no name)"}</p>
                      <p className="text-xs text-muted-foreground">
                        {listLabel(entry.sourceList)}
                        {entry.address ? ` · ${entry.address}` : ""}
                        {entry.needsLocation ? " · needs location" : ""}
                        {entry.placeId ? " · weak pin created" : ""}
                      </p>
                      {entry.googleMapsUrl && (
                        <a
                          href={entry.googleMapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs underline underline-offset-2"
                        >
                          Open Takeout Maps URL
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {entry.placeId && (
                      <>
                        <Button size="sm" variant="outline" asChild>
                          <Link to={`/places/${entry.placeId}`}>Open place</Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            void act(() =>
                              api((c) =>
                                c.import.acceptReview({
                                  params: { id: runId, entryId: entry.id },
                                }),
                              ),
                            )
                          }
                        >
                          Accept pin
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        setResolvingId((current) => (current === entry.id ? null : entry.id))
                      }
                    >
                      {resolvingId === entry.id ? "Hide search" : "Find on Google"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void act(() =>
                          api((c) =>
                            c.import.dismissReview({
                              params: { id: runId, entryId: entry.id },
                            }),
                          ),
                        )
                      }
                    >
                      Skip
                    </Button>
                  </div>
                </div>
                {resolvingId === entry.id && (
                  <div className="mt-3 border-t border-border pt-3">
                    <ReviewGoogleSearch
                      initialQuery={entry.name ?? ""}
                      disabled={busy}
                      onPick={(googlePlaceId, sessionToken) =>
                        void act(() =>
                          api((c) =>
                            c.import.resolveReview({
                              params: { id: runId, entryId: entry.id },
                              payload: { googlePlaceId, sessionToken },
                            }),
                          ),
                        )
                      }
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ReviewGoogleSearch({
  initialQuery,
  disabled,
  onPick,
}: {
  readonly initialQuery: string
  readonly disabled: boolean
  readonly onPick: (googlePlaceId: string, sessionToken: string) => void
}) {
  const [sessionToken] = useState(() => crypto.randomUUID())
  const [query, setQuery] = useState(initialQuery)
  const [suggestions, setSuggestions] = useState<
    ReadonlyArray<{ googlePlaceId: string; primaryText: string; secondaryText: string | null }>
  >([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const input = query.trim()
    if (input.length < 2) {
      setSuggestions([])
      setLoading(false)
      return
    }
    let stale = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      api((c) => c.google.autocomplete({ payload: { input, sessionToken, near: null } })).then(
        (found) => {
          if (!stale) {
            setSuggestions(found)
            setError(null)
            setLoading(false)
          }
        },
        (cause: unknown) => {
          if (!stale) {
            setError(errorMessage(cause))
            setLoading(false)
          }
        },
      )
    }, 250)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [query, sessionToken])

  const trimmed = query.trim()

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search Google Maps…"
      />
      {error && <ErrorAlert message={error} />}
      {loading && <p className="text-xs text-muted-foreground">Searching…</p>}
      {!loading && trimmed.length >= 2 && suggestions.length === 0 && !error && (
        <p className="text-xs text-muted-foreground">
          No matches. Try the address or a shorter name.
        </p>
      )}
      {suggestions.length > 0 && (
        <ul className="flex flex-col rounded-md border border-border">
          {suggestions.map((suggestion) => (
            <li key={suggestion.googlePlaceId} className="border-b border-border last:border-b-0">
              <button
                type="button"
                disabled={disabled}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => onPick(suggestion.googlePlaceId, sessionToken)}
              >
                <span className="font-medium">{suggestion.primaryText}</span>
                {suggestion.secondaryText && (
                  <span className="text-xs text-muted-foreground">{suggestion.secondaryText}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
