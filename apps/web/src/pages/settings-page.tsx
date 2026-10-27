import type {
  DistanceUnit,
  EnrichmentRun,
  InstanceSettingsView,
  Invite,
  InviteStatus,
  UserSummary,
} from "@placard/domain"
import { DateTime } from "effect"
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react"
import { ErrorAlert } from "@/components/error-alert"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { api, errorMessage } from "@/lib/api"
import { useLoad } from "@/lib/use-load"
import { useMe, useSession } from "@/session"

export function SettingsPage() {
  const me = useMe()
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <DistanceUnitCard />
      {me.role === "admin" && (
        <>
          <GoogleKeyCard />
          <EnrichmentCard />
          <InvitesCard />
          <UsersCard />
        </>
      )}
    </div>
  )
}

function SettingsCard({
  title,
  description,
  children,
}: {
  readonly title: string
  readonly description: ReactNode
  readonly children: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

const formatDate = (value: DateTime.Utc) =>
  DateTime.toDateUtc(value).toLocaleDateString(undefined, { dateStyle: "medium" })

function DistanceUnitCard() {
  const me = useMe()
  const { setMe } = useSession()
  const [error, setError] = useState<string | null>(null)

  const change = async (value: string) => {
    if (value !== "km" && value !== "mi") return
    setError(null)
    try {
      const distanceUnit: DistanceUnit = value
      setMe(await api((client) => client.me.updateSettings({ payload: { distanceUnit } })))
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  return (
    <SettingsCard title="Distance unit" description="Used wherever Placard shows a distance.">
      <div className="flex flex-col gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={me.distanceUnit}
          onValueChange={(value) => void change(value)}
          aria-label="Distance unit"
        >
          <ToggleGroupItem value="km">Kilometers</ToggleGroupItem>
          <ToggleGroupItem value="mi">Miles</ToggleGroupItem>
        </ToggleGroup>
        <ErrorAlert message={error} />
      </div>
    </SettingsCard>
  )
}

const loadSettings = () => api((client) => client.admin.settings())

const keySourceText = (view: InstanceSettingsView) => {
  const { source, last4 } = view.googleApiKey
  if (source === "instance") return `A key ending in ${last4} is saved for this instance.`
  if (source === "env") return `Using the GOOGLE_MAPS_API_KEY variable (ending in ${last4}).`
  return "No key yet. Placard works without one, but autocomplete and enrichment need it."
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

const loadInvites = () => api((client) => client.admin.invites())

const statusVariant: Record<InviteStatus, "default" | "secondary" | "outline"> = {
  pending: "default",
  accepted: "secondary",
  expired: "outline",
  revoked: "outline",
}

function InvitesCard() {
  const { data: invites, reload, error: loadError } = useLoad(loadInvites)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const email = String(new FormData(form).get("inviteEmail")).trim()
    setError(null)
    setCopied(false)
    try {
      const created = await api((client) => client.admin.createInvite({ payload: { email } }))
      setLink(created.url)
      form.reset()
      reload()
    } catch (cause) {
      setError(
        typeof cause === "object" && cause !== null && "email" in cause
          ? `${email} already has an account.`
          : errorMessage(cause),
      )
    }
  }

  const revoke = async (invite: Invite) => {
    try {
      await api((client) => client.admin.revokeInvite({ params: { id: invite.id } }))
      reload()
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  const copy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
  }

  return (
    <SettingsCard
      title="Invites"
      description="Signup is closed. Create a link for each person; it works once and expires after 7 days."
    >
      <div className="flex flex-col gap-4">
        <form onSubmit={create} className="flex items-end gap-2">
          <Field className="flex-1">
            <FieldLabel htmlFor="inviteEmail">Email</FieldLabel>
            <Input id="inviteEmail" name="inviteEmail" type="email" required />
          </Field>
          <Button type="submit">Create invite</Button>
        </form>
        <ErrorAlert message={error ?? loadError} />
        {link && (
          <Alert>
            <AlertDescription className="flex flex-col gap-2">
              <span>Send this link to them:</span>
              <code className="break-all text-xs" data-testid="invite-link">
                {link}
              </code>
              <Button size="sm" variant="outline" className="w-fit" onClick={() => void copy()}>
                {copied ? "Copied" : "Copy link"}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {invites && invites.length > 0 && (
          <ul className="flex flex-col divide-y">
            {invites.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{invite.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {invite.status === "pending"
                      ? `Expires ${formatDate(invite.expiresAt)}`
                      : `Created ${formatDate(invite.createdAt)}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant[invite.status]}>{invite.status}</Badge>
                  {invite.status === "pending" && (
                    <Button size="sm" variant="ghost" onClick={() => void revoke(invite)}>
                      Revoke
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SettingsCard>
  )
}

const loadUsers = () => api((client) => client.admin.users())

function UsersCard() {
  const { data: users, error } = useLoad(loadUsers)
  return (
    <SettingsCard
      title="People"
      description="Everyone with an account. Each has a private library."
    >
      <ErrorAlert message={error} />
      <ul className="flex flex-col divide-y">
        {(users ?? []).map((user: UserSummary) => (
          <li key={user.id} className="flex items-center justify-between gap-3 py-2">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
            <Badge variant={user.role === "admin" ? "default" : "secondary"}>{user.role}</Badge>
          </li>
        ))}
      </ul>
    </SettingsCard>
  )
}
