import type { HealthReport } from "@placard/domain"
import { Effect } from "effect"
import { useEffect, useState } from "react"
import { fetchHealth } from "./api.ts"

type HealthState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly report: HealthReport }
  | { readonly status: "failed"; readonly message: string }

export function App() {
  const [health, setHealth] = useState<HealthState>({ status: "loading" })

  useEffect(() => {
    let cancelled = false
    void Effect.runPromise(fetchHealth).then(
      (report) => {
        if (!cancelled) setHealth({ status: "ready", report })
      },
      (error: unknown) => {
        if (!cancelled) {
          setHealth({
            status: "failed",
            message: error instanceof Error ? error.message : String(error),
          })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm tracking-[0.2em] uppercase text-[var(--color-accent)]">
        Places library
      </p>
      <h1 className="text-6xl font-semibold tracking-tight">Placard</h1>
      <p className="max-w-xl text-lg leading-relaxed text-black/70">
        Self-hosted library of the places you care about.
      </p>
      <HealthBadge state={health} />
    </main>
  )
}

function HealthBadge({ state }: { readonly state: HealthState }) {
  if (state.status === "loading") {
    return <p className="text-sm text-black/50">Checking health…</p>
  }
  if (state.status === "failed") {
    return <p className="text-sm text-red-700">Health check failed: {state.message}</p>
  }
  const ok = state.report.status === "ok"
  return (
    <p className={`text-sm ${ok ? "text-[var(--color-accent)]" : "text-red-700"}`}>
      API health: {state.report.status}
      {state.report.checks.database.ok
        ? ` (database ${state.report.checks.database.latencyMs}ms)`
        : ` (database error)`}
    </p>
  )
}
