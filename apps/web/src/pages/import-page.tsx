import type { ImportDecision, ImportEntry } from "@placard/domain"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api, errorMessage } from "@/lib/api"
import { useLoad } from "@/lib/use-load"

/** Display label for starred Saved Places.json entries (sourceList is null). */
const SAVED_PLACES = "Saved Places"

const listLabel = (sourceList: string | null) => sourceList ?? SAVED_PLACES

export function ImportPage() {
  const { runId } = useParams()
  if (runId) return <ImportTriagePage runId={runId} />
  return <ImportUploadPage />
}

function ImportUploadPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { data: runs, reload } = useLoad(useCallback(() => api((c) => c.import.listRuns()), []))

  const onZip = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ""
      for (const b of bytes) binary += String.fromCharCode(b)
      const contentBase64 = btoa(binary)
      const run = await api((c) =>
        c.import.start({
          payload: { kind: "zip", filename: file.name, contentBase64 },
        }),
      )
      navigate(`/import/${run.id}`)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Import</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a Google Takeout zip. Triage is free — no Places API calls until you commit.
        </p>
      </div>
      {error && <ErrorAlert message={error} />}
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-6">
        <label htmlFor="takeout-zip" className="font-medium">
          {busy ? "Uploading…" : "Choose Takeout zip"}
        </label>
        <p className="text-xs text-muted-foreground">
          Expects <code>Maps (your places)/Saved Places.json</code> and/or <code>Saved/*.csv</code>
        </p>
        <Input
          id="takeout-zip"
          type="file"
          accept=".zip,application/zip"
          disabled={busy}
          className="max-w-sm"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void onZip(file)
          }}
        />
      </div>
      {runs && runs.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Recent imports</h2>
          <ul className="divide-y divide-border rounded-md border border-border">
            {runs.map((run) => (
              <li
                key={run.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <div className="flex flex-col">
                  <Link
                    to={`/import/${run.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {run.status} · {run.counts.parsed} entries
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    kept {run.counts.kept} · skip {run.counts.skipped} · pending{" "}
                    {run.counts.pending}
                  </span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void reload()}>
                  Refresh
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

type ListSummary = {
  readonly key: string | null
  readonly label: string
  readonly total: number
  readonly pending: number
  readonly kept: number
  readonly skipped: number
}

const summarizeLists = (entries: ReadonlyArray<ImportEntry>): ReadonlyArray<ListSummary> => {
  const map = new Map<string | null, { pending: number; kept: number; skipped: number }>()
  for (const entry of entries) {
    const key = entry.sourceList
    const current = map.get(key) ?? { pending: 0, kept: 0, skipped: 0 }
    if (entry.decision === "pending") current.pending++
    else if (entry.decision === "keep") current.kept++
    else current.skipped++
    map.set(key, current)
  }
  return [...map.entries()]
    .map(([key, counts]) => ({
      key,
      label: listLabel(key),
      total: counts.pending + counts.kept + counts.skipped,
      ...counts,
    }))
    .sort((a, b) => {
      // Saved Places first — that's usually the bulk of pending after list skips.
      if (a.key === null) return -1
      if (b.key === null) return 1
      return a.label.localeCompare(b.label)
    })
}

const decisionBadge = (decision: ImportDecision) => {
  if (decision === "keep") return <Badge variant="default">keep</Badge>
  if (decision === "skip") return <Badge variant="destructive">skip</Badge>
  return <Badge variant="outline">pending</Badge>
}

function ImportTriagePage({ runId }: { readonly runId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [listFilter, setListFilter] = useState<string | null | undefined>(undefined)
  const [decisionFilter, setDecisionFilter] = useState<ImportDecision | "all">("all")
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const loadRun = useCallback(() => api((c) => c.import.getRun({ params: { id: runId } })), [runId])
  const loadEntries = useCallback(
    () => api((c) => c.import.listEntries({ params: { id: runId }, payload: {} })),
    [runId],
  )

  const { data: run, reload: reloadRun } = useLoad(loadRun)
  const { data: allEntries, reload: reloadEntries } = useLoad(loadEntries)

  const lists = useMemo(() => summarizeLists(allEntries ?? []), [allEntries])

  const shown = useMemo(() => {
    const q = text.trim().toLowerCase()
    return (allEntries ?? []).filter((entry) => {
      if (listFilter !== undefined) {
        if (listFilter === null && entry.sourceList !== null) return false
        if (listFilter !== null && entry.sourceList !== listFilter) return false
      }
      if (decisionFilter !== "all" && entry.decision !== decisionFilter) return false
      if (!q) return true
      const hay = `${entry.name ?? ""} ${entry.address ?? ""} ${entry.note ?? ""}`.toLowerCase()
      return hay.includes(q)
    })
  }, [allEntries, text, listFilter, decisionFilter])

  const allShownSelected = shown.length > 0 && shown.every((entry) => selected.has(entry.id))
  const someShownSelected = shown.some((entry) => selected.has(entry.id))

  const refresh = async () => {
    await Promise.all([reloadRun(), reloadEntries()])
  }

  const decide = async (entryIds: ReadonlyArray<string>, decision: ImportDecision) => {
    if (entryIds.length === 0) return
    setBusy(true)
    setError(null)
    try {
      await api((c) =>
        c.import.setDecisions({
          params: { id: runId },
          payload: { entryIds, decision },
        }),
      )
      setSelected(new Set())
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const decideList = async (sourceList: string | null, decision: ImportDecision) => {
    setBusy(true)
    setError(null)
    try {
      await api((c) =>
        c.import.setListDecision({
          params: { id: runId },
          payload: { sourceList, decision },
        }),
      )
      setListFilter(sourceList)
      setDecisionFilter(decision)
      setSelected(new Set())
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    setBusy(true)
    setError(null)
    try {
      await api((c) => c.import.commit({ params: { id: runId } }))
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const undo = async (confirmEdited: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await api((c) => c.import.undo({ params: { id: runId }, payload: { confirmEdited } }))
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const toggleAllShown = () => {
    if (allShownSelected) {
      const next = new Set(selected)
      for (const entry of shown) next.delete(entry.id)
      setSelected(next)
      return
    }
    const next = new Set(selected)
    for (const entry of shown) next.add(entry.id)
    setSelected(next)
  }

  if (!run) return <p className="text-sm text-muted-foreground">Loading import…</p>

  const savedPlaces = lists.find((list) => list.key === null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link to="/import" className="underline-offset-4 hover:underline">
              Import
            </Link>{" "}
            / triage
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Takeout triage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Status <Badge variant="secondary">{run.status}</Badge> · {run.counts.parsed} parsed ·{" "}
            {run.counts.kept} keep · {run.counts.skipped} skip · {run.counts.pending} pending · ~
            {run.expectedApiCalls} API calls if you commit kept entries
          </p>
          {run.counts.pending > 0 && savedPlaces && savedPlaces.pending > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {savedPlaces.pending} pending are in <strong>Saved Places</strong> (starred pins) —
              skipping CSV lists does not include them. Use the Saved Places chip below.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {run.status === "triage" && (
            <Button disabled={busy || run.counts.pending > 0} onClick={() => void commit()}>
              Commit kept
            </Button>
          )}
          {run.status === "done" && (
            <Button variant="destructive" disabled={busy} onClick={() => void undo(true)}>
              Undo import
            </Button>
          )}
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {run.status === "triage" && (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Lists</p>
            <div className="flex flex-wrap gap-2">
              {lists.map((list) => {
                const state =
                  list.pending === 0 && list.skipped === list.total
                    ? "skip"
                    : list.pending === 0 && list.kept === list.total
                      ? "keep"
                      : list.pending === list.total
                        ? "pending"
                        : "mixed"
                const active = listFilter === list.key
                return (
                  <div
                    key={list.label}
                    className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs ${
                      active ? "border-foreground bg-muted" : "border-border"
                    } ${state === "skip" ? "opacity-70" : ""}`}
                  >
                    <button
                      type="button"
                      className="text-left font-medium underline-offset-2 hover:underline"
                      onClick={() =>
                        setListFilter((current) => (current === list.key ? undefined : list.key))
                      }
                    >
                      {list.label}
                      <span className="ml-1 font-normal text-muted-foreground">({list.total})</span>
                    </button>
                    {decisionBadge(
                      state === "keep" ? "keep" : state === "skip" ? "skip" : "pending",
                    )}
                    {state === "mixed" && (
                      <span className="text-muted-foreground">
                        {list.kept}k/{list.skipped}s/{list.pending}p
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1"
                      disabled={busy || state === "keep"}
                      onClick={() => void decideList(list.key, "keep")}
                    >
                      keep
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1"
                      disabled={busy || state === "skip"}
                      onClick={() => void decideList(list.key, "skip")}
                    >
                      skip
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Filter by text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="max-w-xs"
            />
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              value={decisionFilter}
              onChange={(e) => setDecisionFilter(e.target.value as ImportDecision | "all")}
            >
              <option value="all">All decisions</option>
              <option value="pending">Pending only</option>
              <option value="keep">Kept only</option>
              <option value="skip">Skipped only</option>
            </select>
            {(listFilter !== undefined || decisionFilter !== "all" || text) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setListFilter(undefined)
                  setDecisionFilter("all")
                  setText("")
                }}
              >
                Clear filters
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              Showing {shown.length}
              {selected.size > 0 ? ` · ${selected.size} selected` : ""}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || selected.size === 0}
              onClick={() => void decide([...selected], "keep")}
            >
              Keep selected
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || selected.size === 0}
              onClick={() => void decide([...selected], "skip")}
            >
              Skip selected
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || shown.length === 0}
              onClick={() =>
                void decide(
                  shown.map((e) => e.id),
                  "keep",
                )
              }
            >
              Keep all shown
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || shown.length === 0}
              onClick={() =>
                void decide(
                  shown.map((e) => e.id),
                  "skip",
                )
              }
            >
              Skip all shown
            </Button>
          </div>

          <EntriesTable
            entries={shown}
            selected={selected}
            allSelected={allShownSelected}
            someSelected={someShownSelected}
            onToggleAll={toggleAllShown}
            onToggle={(id) => {
              const next = new Set(selected)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              setSelected(next)
            }}
            onDecide={(id, decision) => void decide([id], decision)}
          />
        </>
      )}

      {run.status === "done" && (
        <NeedsReviewSection
          runId={runId}
          matched={run.counts.matched}
          needsReview={run.counts.needsReview}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          onChanged={refresh}
        />
      )}
    </div>
  )
}

function NeedsReviewSection({
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

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      setResolvingId(null)
      await Promise.all([reload(), onChanged()])
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
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
          <ul className="flex flex-col gap-3">
            {(reviewEntries ?? []).map((entry) => (
              <li key={entry.id} className="rounded-md border border-border/70 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
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

  useEffect(() => {
    const input = query.trim()
    if (input.length < 2) {
      setSuggestions([])
      return
    }
    let stale = false
    const timer = window.setTimeout(() => {
      api((c) => c.google.autocomplete({ payload: { input, sessionToken, near: null } })).then(
        (found) => {
          if (!stale) {
            setSuggestions(found)
            setError(null)
          }
        },
        (cause: unknown) => {
          if (!stale) setError(errorMessage(cause))
        },
      )
    }, 250)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [query, sessionToken])

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search Google Maps…"
      />
      {error && <ErrorAlert message={error} />}
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

function EntriesTable({
  entries,
  selected,
  allSelected,
  someSelected,
  onToggleAll,
  onToggle,
  onDecide,
}: {
  readonly entries: ReadonlyArray<ImportEntry>
  readonly selected: ReadonlySet<string>
  readonly allSelected: boolean
  readonly someSelected: boolean
  readonly onToggleAll: () => void
  readonly onToggle: (id: string) => void
  readonly onDecide: (id: string, decision: ImportDecision) => void
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-2 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = !allSelected && someSelected
                }}
                onChange={onToggleAll}
                aria-label="Select all shown"
              />
            </th>
            <th className="px-2 py-2">Name</th>
            <th className="px-2 py-2">List</th>
            <th className="px-2 py-2">Flags</th>
            <th className="px-2 py-2">Decision</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className={`border-b border-border/60 ${
                entry.decision === "skip"
                  ? "bg-destructive/5 text-muted-foreground"
                  : entry.decision === "keep"
                    ? "bg-primary/5"
                    : ""
              }`}
            >
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(entry.id)}
                  onChange={() => onToggle(entry.id)}
                  aria-label={`Select ${entry.name ?? "entry"}`}
                />
              </td>
              <td className="px-2 py-2">
                <div className="font-medium">{entry.name ?? "(no name)"}</div>
                <div className="text-xs text-muted-foreground">{entry.address}</div>
              </td>
              <td className="px-2 py-2 text-xs">{listLabel(entry.sourceList)}</td>
              <td className="px-2 py-2">
                <div className="flex flex-wrap gap-1">
                  {entry.needsLocation && <Badge variant="outline">needs location</Badge>}
                  {entry.alreadyInLibrary && <Badge variant="outline">in library</Badge>}
                  {entry.crossListDuplicate && <Badge variant="outline">cross-list</Badge>}
                </div>
              </td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-1">
                  {decisionBadge(entry.decision)}
                  {entry.decision !== "keep" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1"
                      onClick={() => onDecide(entry.id, "keep")}
                    >
                      keep
                    </Button>
                  )}
                  {entry.decision !== "skip" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1"
                      onClick={() => onDecide(entry.id, "skip")}
                    >
                      skip
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">No entries match this filter.</p>
      )}
    </div>
  )
}
