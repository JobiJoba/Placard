import type { EnrichmentRun, InstanceSettingsView } from "@placard/domain"
import { type FormEvent, useCallback, useEffect, useState } from "react"
import { ErrorAlert } from "@/components/error-alert"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { api, errorMessage } from "@/lib/api"
import { useLoad } from "@/lib/use-load"
import { SettingsCard } from "./settings-card"

const loadSettings = () => api((client) => client.admin.settings())

const keySourceText = (view: InstanceSettingsView) => {
  const { source, last4 } = view.googleApiKey
  if (source === "instance") return `A key ending in ${last4} is saved for this instance.`
  if (source === "env") return `Using the GOOGLE_MAPS_API_KEY variable (ending in ${last4}).`
  return "No key yet. Placard works without one, but autocomplete and enrichment need it."
}

export function SettingsIntegrationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <GoogleKeyCard />
      <EnrichmentCard />
    </div>
  )
}

function GoogleKeyCard() {
  const { data, setData, error: loadError } = useLoad(loadSettings)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const apiKey = String(new FormData(form).get("apiKey")).trim()
    setPending(true)
    setError(null)
    setSaved(false)
    try {
      setData(await api((client) => client.admin.setGoogleApiKey({ payload: { apiKey } })))
      setSaved(true)
      form.reset()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setPending(false)
    }
  }

  const remove = async () => {
    setError(null)
    setSaved(false)
    try {
      setData(await api((client) => client.admin.clearGoogleApiKey()))
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  return (
    <SettingsCard
      title="Google API key"
      description="Shared by everyone on this instance. Placard makes a free test call before saving it."
    >
      <form onSubmit={save}>
        <FieldGroup>
          <p className="text-sm" data-testid="google-key-status">
            {data ? keySourceText(data) : "Loading…"}
          </p>
          <Field>
            <FieldLabel htmlFor="apiKey">New key</FieldLabel>
            <Input id="apiKey" name="apiKey" autoComplete="off" spellCheck={false} required />
            <FieldDescription>
              Needs Places API (New) enabled, plus Maps JavaScript API for picking places on the
              map.
            </FieldDescription>
          </Field>
          <ErrorAlert message={error ?? loadError} />
          {saved && (
            <Alert>
              <AlertDescription>Key works and is saved.</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Testing…" : "Test and save"}
            </Button>
            {data?.googleApiKey.source === "instance" && (
              <Button type="button" variant="outline" onClick={() => void remove()}>
                Remove saved key
              </Button>
            )}
          </div>
        </FieldGroup>
      </form>
    </SettingsCard>
  )
}

function EnrichmentCard() {
  const {
    data: plan,
    error: planError,
    reload: reloadPlan,
  } = useLoad(useCallback(() => api((c) => c.admin.enrichmentPlan()), []))
  const [run, setRun] = useState<EnrichmentRun | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    let cancelled = false
    const tick = () => {
      void api((c) => c.admin.enrichmentRun()).then(
        (next) => {
          if (!cancelled) setRun(next)
        },
        () => undefined,
      )
    }
    tick()
    const id = window.setInterval(tick, 1500)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const start = async () => {
    setStarting(true)
    setError(null)
    try {
      setRun(await api((c) => c.admin.refreshAll()))
      setConfirming(false)
      reloadPlan()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setStarting(false)
    }
  }

  const running = run?.status === "running"
  const progress =
    run && run.total > 0 ? Math.round(((run.completed + run.failed) / run.total) * 100) : 0

  return (
    <SettingsCard
      title="Force refresh all"
      description="Re-fetch hours, phone, website, price, and rating from Google for every place that has a Google ID. Manual edits stay put."
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm" data-testid="enrichment-plan">
          {plan
            ? plan.placeCount === 0
              ? "No Google-linked places to refresh."
              : `This will use about ${plan.placeCount} Place Details ${plan.placeCount === 1 ? "call" : "calls"}.`
            : "Loading…"}
        </p>
        {run && (
          <div className="flex flex-col gap-1 text-sm" data-testid="enrichment-progress">
            <div className="flex justify-between gap-2">
              <span>
                {run.status === "running"
                  ? "Refreshing…"
                  : run.status === "done"
                    ? "Last refresh finished"
                    : "Last refresh failed"}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {run.completed + run.failed}/{run.total}
                {run.failed > 0 ? ` (${run.failed} failed)` : ""}
              </span>
            </div>
            {run.total > 0 && (
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-foreground transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        )}
        <ErrorAlert message={error ?? planError} />
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">
              Refresh {plan?.placeCount ?? 0} {(plan?.placeCount ?? 0) === 1 ? "place" : "places"}{" "}
              from Google?
            </span>
            <Button size="sm" disabled={starting || running} onClick={() => void start()}>
              {starting ? "Starting…" : "Start refresh"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            className="w-fit"
            variant="outline"
            disabled={running || (plan?.placeCount ?? 0) === 0}
            onClick={() => setConfirming(true)}
          >
            {running ? "Refresh in progress…" : "Force refresh all"}
          </Button>
        )}
      </div>
    </SettingsCard>
  )
}
