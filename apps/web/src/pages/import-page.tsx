import type { ImportDecision, ImportEntry, ImportRun } from "@placard/domain"
import { useCallback, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api, errorMessage } from "@/lib/api"
import { useLoad } from "@/lib/use-load"

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

function ImportTriagePage({ runId }: { readonly runId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const loadRun = useCallback(() => api((c) => c.import.getRun({ params: { id: runId } })), [runId])
  const loadEntries = useCallback(
    () =>
      api((c) =>
        c.import.listEntries({
          params: { id: runId },
          payload: text.trim() ? { text: text.trim() } : {},
        }),
      ),
    [runId, text],
  )

  const { data: run, reload: reloadRun } = useLoad(loadRun)
  const { data: entries, reload: reloadEntries } = useLoad(loadEntries)

  const lists = useMemo(() => {
    const names = new Set<string>()
    for (const entry of entries ?? []) {
      if (entry.sourceList) names.add(entry.sourceList)
    }
    return [...names].sort()
  }, [entries])

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

  const decideList = async (sourceList: string, decision: ImportDecision) => {
    setBusy(true)
    setError(null)
    try {
      await api((c) =>
        c.import.setListDecision({
          params: { id: runId },
          payload: { sourceList, decision },
        }),
      )
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

  if (!run) return <p className="text-sm text-muted-foreground">Loading import…</p>

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
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Filter by text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="max-w-xs"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void decide([...selected], "keep")}
            >
              Keep selected
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void decide([...selected], "skip")}
            >
              Skip selected
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void decide(
                  (entries ?? []).map((e) => e.id),
                  "keep",
                )
              }
            >
              Keep all shown
            </Button>
          </div>

          {lists.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {lists.map((name) => (
                <div
                  key={name}
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"
                >
                  <span>{name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1"
                    disabled={busy}
                    onClick={() => void decideList(name, "keep")}
                  >
                    keep
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1"
                    disabled={busy}
                    onClick={() => void decideList(name, "skip")}
                  >
                    skip
                  </Button>
                </div>
              ))}
            </div>
          )}

          <EntriesTable
            entries={entries ?? []}
            selected={selected}
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
        <p className="text-sm text-muted-foreground">
          Import finished. Matched {run.counts.matched}, needs review {run.counts.needsReview}.{" "}
          <Link to="/" className="underline underline-offset-4">
            Open library
          </Link>
        </p>
      )}
    </div>
  )
}

function EntriesTable({
  entries,
  selected,
  onToggle,
  onDecide,
}: {
  readonly entries: ReadonlyArray<ImportEntry>
  readonly selected: ReadonlySet<string>
  readonly onToggle: (id: string) => void
  readonly onDecide: (id: string, decision: ImportDecision) => void
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-2 py-2" />
            <th className="px-2 py-2">Name</th>
            <th className="px-2 py-2">List</th>
            <th className="px-2 py-2">Flags</th>
            <th className="px-2 py-2">Decision</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-border/60">
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(entry.id)}
                  onChange={() => onToggle(entry.id)}
                />
              </td>
              <td className="px-2 py-2">
                <div className="font-medium">{entry.name ?? "(no name)"}</div>
                <div className="text-xs text-muted-foreground">{entry.address}</div>
              </td>
              <td className="px-2 py-2 text-xs">{entry.sourceList ?? "Saved Places"}</td>
              <td className="px-2 py-2">
                <div className="flex flex-wrap gap-1">
                  {entry.needsLocation && <Badge variant="outline">needs location</Badge>}
                  {entry.alreadyInLibrary && <Badge variant="outline">in library</Badge>}
                  {entry.crossListDuplicate && <Badge variant="outline">cross-list</Badge>}
                </div>
              </td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-1">
                  <Badge variant={entry.decision === "keep" ? "default" : "secondary"}>
                    {entry.decision}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1"
                    onClick={() => onDecide(entry.id, "keep")}
                  >
                    keep
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1"
                    onClick={() => onDecide(entry.id, "skip")}
                  >
                    skip
                  </Button>
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
