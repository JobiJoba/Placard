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
const PAGE_SIZE = 50

const listLabel = (sourceList: string | null) => sourceList ?? SAVED_PLACES

export function ImportPage() {
  const { runId } = useParams()
  if (runId) return <ImportTriagePage runId={runId} />
  return <ImportUploadPage />
}

const MAX_ZIP_BYTES = 80 * 1024 * 1024

const statusLabel = (status: string) => {
  switch (status) {
    case "triage":
      return "Ready to triage"
    case "done":
      return "Committed"
    case "undone":
      return "Undone"
    case "failed":
      return "Failed"
    case "parsing":
      return "Parsing"
    case "committing":
      return "Committing"
    default:
      return status
  }
}

function ImportUploadPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const { data: runs, reload } = useLoad(useCallback(() => api((c) => c.import.listRuns()), []))

  const onZip = async (file: File) => {
    if (file.size > MAX_ZIP_BYTES) {
      setError(`Zip is too large (${(file.size / (1024 * 1024)).toFixed(0)} MB). Max 80 MB.`)
      return
    }
    setBusy(true)
    setError(null)
    setProgress(`Reading ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)…`)
    try {
      const buffer = await file.arrayBuffer()
      setProgress("Encoding and uploading…")
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
      setProgress(null)
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
          {busy ? (progress ?? "Uploading…") : "Choose Takeout zip"}
        </label>
        <p className="text-xs text-muted-foreground">
          Expects <code>Maps (your places)/Saved Places.json</code> and/or <code>Saved/*.csv</code>.
          Max 80 MB.
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
            event.target.value = ""
          }}
        />
      </div>
      {runs && runs.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-medium">Recent imports</h2>
            <Button size="sm" variant="ghost" onClick={() => void reload()}>
              Refresh
            </Button>
          </div>
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
                    {statusLabel(run.status)} · {run.counts.parsed} entries
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {run.status === "triage"
                      ? `Continue triage — ${run.counts.pending} pending`
                      : `kept ${run.counts.kept} · skip ${run.counts.skipped} · pending ${run.counts.pending}`}
                  </span>
                </div>
                {run.status === "triage" && (
                  <Button size="sm" asChild>
                    <Link to={`/import/${run.id}`}>Continue</Link>
                  </Button>
                )}
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
  const [decisionFilter, setDecisionFilter] = useState<ImportDecision | "all">("pending")
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [confirmCommit, setConfirmCommit] = useState(false)
  const [confirmUndo, setConfirmUndo] = useState(false)
  const [page, setPage] = useState(0)

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

  // Reset selection when filters change so bulk actions can't hit off-screen rows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on filter change
  useEffect(() => {
    setSelected(new Set())
    setPage(0)
  }, [text, listFilter, decisionFilter])

  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const pageEntries = useMemo(
    () => shown.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [shown, page],
  )

  const allShownSelected =
    pageEntries.length > 0 && pageEntries.every((entry) => selected.has(entry.id))
  const someShownSelected = pageEntries.some((entry) => selected.has(entry.id))
  const selectedHidden = [...selected].filter((id) => !shown.some((e) => e.id === id)).length

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
      setDecisionFilter("pending")
      setListFilter(undefined)
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
      setConfirmCommit(false)
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
      setConfirmUndo(false)
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
      for (const entry of pageEntries) next.delete(entry.id)
      setSelected(next)
      return
    }
    const next = new Set(selected)
    for (const entry of pageEntries) next.add(entry.id)
    setSelected(next)
  }

  const keepAllShown = () => {
    if (shown.length >= 25 && !window.confirm(`Keep all ${shown.length} shown entries?`)) return
    void decide(
      shown.map((e) => e.id),
      "keep",
    )
  }

  const skipAllShown = () => {
    if (shown.length >= 25 && !window.confirm(`Skip all ${shown.length} shown entries?`)) return
    void decide(
      shown.map((e) => e.id),
      "skip",
    )
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
        <div className="flex flex-col items-end gap-2">
          {run.status === "triage" && (
            <>
              {confirmCommit ? (
                <div className="flex max-w-sm flex-col items-end gap-2 text-right">
                  <p className="text-sm text-muted-foreground">
                    Commit {run.counts.kept} kept places (~{run.expectedApiCalls} Google API calls)?
                  </p>
                  <div className="flex gap-2">
                    <Button disabled={busy} onClick={() => void commit()}>
                      {busy ? "Committing…" : "Confirm commit"}
                    </Button>
                    <Button variant="ghost" disabled={busy} onClick={() => setConfirmCommit(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-end gap-1">
                  <Button
                    disabled={busy || run.counts.pending > 0 || run.counts.kept === 0}
                    onClick={() => setConfirmCommit(true)}
                  >
                    Commit kept
                  </Button>
                  {run.counts.pending > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Resolve {run.counts.pending} pending first (filter: Pending only).
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          {run.status === "done" && (
            <>
              {confirmUndo ? (
                <div className="flex max-w-sm flex-col items-end gap-2 text-right">
                  <p className="text-sm text-muted-foreground">
                    Undo removes places from this import, including ones you've edited since. This
                    cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="destructive" disabled={busy} onClick={() => void undo(true)}>
                      {busy ? "Undoing…" : "Confirm undo"}
                    </Button>
                    <Button variant="ghost" disabled={busy} onClick={() => setConfirmUndo(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="destructive" disabled={busy} onClick={() => setConfirmUndo(true)}>
                  Undo import
                </Button>
              )}
            </>
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
            {(listFilter !== undefined || decisionFilter !== "pending" || text) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setListFilter(undefined)
                  setDecisionFilter("pending")
                  setText("")
                }}
              >
                Clear filters
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              Showing {shown.length}
              {shown.length > PAGE_SIZE ? ` · page ${page + 1}/${pageCount}` : ""}
              {selected.size > 0 ? ` · ${selected.size} selected` : ""}
              {selectedHidden > 0 ? ` (${selectedHidden} off this filter)` : ""}
            </span>
          </div>

          <div className="sticky bottom-20 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur md:bottom-4">
            <span className="text-xs text-muted-foreground">{run.counts.pending} pending left</span>
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
              onClick={keepAllShown}
            >
              Keep all shown
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || shown.length === 0}
              onClick={skipAllShown}
            >
              Skip all shown
            </Button>
          </div>

          <EntriesTable
            entries={pageEntries}
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
          {pageCount > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {pageCount}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
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
      <ul className="flex flex-col divide-y md:hidden">
        {entries.map((entry) => (
          <li key={entry.id} className="flex flex-col gap-2 p-3">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.has(entry.id)}
                onChange={() => onToggle(entry.id)}
                aria-label={`Select ${entry.name ?? "entry"}`}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{entry.name ?? "(unnamed)"}</p>
                <p className="text-xs text-muted-foreground">{listLabel(entry.sourceList)}</p>
              </div>
              {decisionBadge(entry.decision)}
            </div>
            <div className="flex gap-2 pl-6">
              <Button
                size="sm"
                variant={entry.decision === "keep" ? "default" : "outline"}
                onClick={() => onDecide(entry.id, "keep")}
              >
                Keep
              </Button>
              <Button
                size="sm"
                variant={entry.decision === "skip" ? "destructive" : "outline"}
                onClick={() => onDecide(entry.id, "skip")}
              >
                Skip
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <table className="hidden w-full min-w-[640px] text-left text-sm md:table">
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
