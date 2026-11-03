import { useEffect, useState } from "react"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import { useLoad } from "@/lib/use-load"
import { SettingsCard } from "./settings-card"

const loadDebug = () => api((client) => client.admin.debug())

export function SettingsDebugPage() {
  const { data, error, reload } = useLoad(loadDebug)
  const [search, setSearch] = useState("")
  const [level, setLevel] = useState("")
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(reload, 10_000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, reload])

  const logs =
    data?.logs.filter(
      (entry) =>
        (!level || entry.level.toLowerCase() === level) &&
        entry.message.toLowerCase().includes(search.toLowerCase()),
    ) ?? []

  return (
    <div className="flex flex-col gap-6">
      <ErrorAlert message={error} />
      <SettingsCard
        title="Debug"
        description="Version and diagnostics for this Placard server. Only administrators can access this page."
      >
        {!data ? (
          <p className="text-sm text-muted-foreground">Loading diagnostics…</p>
        ) : (
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Placard version</dt>
            <dd className="font-mono break-all">{data.version}</dd>
            <dt className="text-muted-foreground">Revision</dt>
            <dd className="font-mono break-all">{data.revision ?? "Unavailable (local build)"}</dd>
            <dt className="text-muted-foreground">Node.js</dt>
            <dd className="font-mono">{data.nodeVersion}</dd>
            <dt className="text-muted-foreground">Started</dt>
            <dd>{new Date(data.startedAt).toLocaleString()}</dd>
            <dt className="text-muted-foreground">Uptime</dt>
            <dd>
              {Math.floor(data.uptimeSeconds / 3_600)}h{" "}
              {Math.floor((data.uptimeSeconds % 3_600) / 60)}m {data.uptimeSeconds % 60}s
            </dd>
          </dl>
        )}
      </SettingsCard>
      <SettingsCard
        title="Recent server logs"
        description={`The latest ${data?.logCapacity ?? 500} application log entries from this server process, newest first. History resets on restart. Worker and browser logs are not included.`}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              aria-label="Search logs"
              placeholder="Search logs…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-40 flex-1"
            />
            <select
              aria-label="Log level"
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All levels</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
              <option value="fatal">Fatal</option>
            </select>
            <Button variant="outline" onClick={reload}>
              Refresh
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
            Refresh every 10 seconds
          </label>
          <section
            className="max-h-[32rem] overflow-auto rounded-md border bg-muted/40 p-3"
            aria-label="Server logs"
          >
            {!data ? (
              <p className="text-sm text-muted-foreground">Loading logs…</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {data.logs.length
                  ? "No logs match your filters."
                  : "No application logs recorded yet."}
              </p>
            ) : (
              <ol className="space-y-3 font-mono text-xs">
                {logs.map((entry) => (
                  <li key={entry.id} className="whitespace-pre-wrap break-words">
                    <span className="text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>{" "}
                    <span
                      className={
                        /error|fatal/i.test(entry.level)
                          ? "font-semibold text-destructive"
                          : "font-semibold"
                      }
                    >
                      {entry.level}
                    </span>
                    <p className="mt-1">{entry.message}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
          {data && (
            <p className="text-xs text-muted-foreground">
              Showing {logs.length} of {data.logs.length} retained entries.
            </p>
          )}
        </div>
      </SettingsCard>
    </div>
  )
}
