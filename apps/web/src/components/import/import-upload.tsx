import { MAX_IMPORT_ZIP_BYTES } from "@placard/domain"
import { useCallback, useState } from "react"
import { Link, useNavigate } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api, errorMessage } from "@/lib/api"
import { useLoad } from "@/lib/use-load"

const MAX_ZIP_MB = Math.round(MAX_IMPORT_ZIP_BYTES / (1024 * 1024))

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

export function ImportUploadPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const { data: runs, reload } = useLoad(useCallback(() => api((c) => c.import.listRuns()), []))

  const onZip = async (file: File) => {
    if (file.size > MAX_IMPORT_ZIP_BYTES) {
      setError(
        `Zip is too large (${(file.size / (1024 * 1024)).toFixed(0)} MB). Max ${MAX_ZIP_MB} MB.`,
      )
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
          Max {MAX_ZIP_MB} MB.
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
