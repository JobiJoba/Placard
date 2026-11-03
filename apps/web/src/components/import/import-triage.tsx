import type { ImportDecision, ImportEntry } from "@placard/domain"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { GoogleCostEstimate } from "@/components/google-cost-estimate"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api, errorMessage } from "@/lib/api"
import { useLoad } from "@/lib/use-load"
import { EntriesTable } from "./entries-table"
import { decisionBadge, listLabel } from "./entry-labels"
import { NeedsReviewSection } from "./needs-review"

const PAGE_SIZE = 50

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

export function ImportTriagePage({ runId }: { readonly runId: string }) {
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

  const { data: run, error: runError, reload: reloadRun } = useLoad(loadRun)
  const { data: allEntries, error: entriesError, reload: reloadEntries } = useLoad(loadEntries)

  const processing = run?.status === "parsing" || run?.status === "committing"
  useEffect(() => {
    if (!processing) return
    const timer = window.setInterval(reloadRun, 2000)
    return () => window.clearInterval(timer)
  }, [processing, reloadRun])

  useEffect(() => {
    if (run?.status === "triage" || run?.status === "done") reloadEntries()
  }, [run?.status, reloadEntries])

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

  if (!run)
    return runError ? (
      <ErrorAlert message={runError} />
    ) : (
      <p className="text-sm text-muted-foreground">Loading import…</p>
    )

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
          {run.status === "triage" &&
            (confirmCommit ? (
              <div className="flex max-w-sm flex-col items-end gap-2 text-right">
                <p className="text-sm text-muted-foreground">
                  Commit {run.counts.kept} kept places (~{run.expectedApiCalls} Google API calls)?
                </p>
                <GoogleCostEstimate action="import" count={run.counts.kept} />
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
            ))}
          {run.status === "done" &&
            (confirmUndo ? (
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
            ))}
        </div>
      </div>

      {(error || runError || entriesError) && (
        <ErrorAlert message={error || runError || entriesError || "Could not load import"} />
      )}
      {run.errorMessage && <ErrorAlert message={run.errorMessage} />}
      {processing && (
        <div className="rounded-lg border border-border p-4" role="status">
          <p className="font-medium">
            {run.status === "parsing"
              ? "Preparing your import in the background…"
              : "Importing your kept places in the background…"}
          </p>
          {run.status === "committing" && (
            <p className="mt-1 text-sm text-muted-foreground">
              {run.counts.matched + run.counts.needsReview} of {run.counts.kept} places processed.
            </p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            You can leave this page and keep using Placard. Check Recent imports for updates.
          </p>
          <Button asChild variant="outline" className="mt-3">
            <Link to="/">Go to library</Link>
          </Button>
        </div>
      )}

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
