import type {
  CatalogModule,
  DistanceUnit,
  EnrichmentRun,
  InstalledModule,
  InstanceSettingsView,
  Invite,
  InviteStatus,
  MyModule,
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
import { changePassword } from "@/lib/auth-client"
import { useLoad } from "@/lib/use-load"
import { useMe, useSession } from "@/session"

export function SettingsPage() {
  const me = useMe()
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <AccountCard />
      <DistanceUnitCard />
      <MyModulesCard />
      {me.role === "admin" && (
        <>
          <MarketplaceCard />
          <GoogleKeyCard />
          <EnrichmentCard />
          <InvitesCard />
          <UsersCard />
        </>
      )}
    </div>
  )
}

function AccountCard() {
  const me = useMe()
  const { signOut } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pending, setPending] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const currentPassword = String(data.get("currentPassword"))
    const newPassword = String(data.get("newPassword"))
    const confirm = String(data.get("confirmPassword"))
    if (newPassword !== confirm) {
      setError("New passwords don't match.")
      setOk(false)
      return
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.")
      setOk(false)
      return
    }
    setPending(true)
    setError(null)
    setOk(false)
    const message = await changePassword(currentPassword, newPassword)
    setPending(false)
    if (message) setError(message)
    else {
      setOk(true)
      event.currentTarget.reset()
    }
  }

  return (
    <SettingsCard
      title="Account"
      description={`${me.name} · ${me.email}. Change your password or sign out.`}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="newPassword">New password</FieldLabel>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
        </FieldGroup>
        <ErrorAlert message={error} />
        {ok && <p className="text-sm text-muted-foreground">Password updated.</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Updating…" : "Change password"}
          </Button>
          <Button type="button" variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </form>
    </SettingsCard>
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
    if (!window.confirm(`Revoke invite for ${invite.email}?`)) return
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
        {invites && invites.length === 0 && (
          <p className="text-sm text-muted-foreground">No invites yet. Create one above.</p>
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

function MyModulesCard() {
  const {
    data: modules,
    error,
    reload,
    setData,
  } = useLoad(useCallback(() => api((c) => c.modules.me()), []))
  const [actionError, setActionError] = useState<string | null>(null)

  const setVisible = (mod: MyModule, visible: boolean) => {
    setActionError(null)
    void api((c) => c.modules.setVisible({ params: { id: mod.id }, payload: { visible } })).then(
      (updated) => {
        setData((prev) => (prev ?? []).map((m) => (m.id === updated.id ? updated : m)))
      },
      (cause: unknown) => setActionError(errorMessage(cause)),
    )
  }

  return (
    <SettingsCard
      title="My modules"
      description="Plugins installed on this instance. Hide one to remove it from your navigation."
    >
      <ErrorAlert message={error ?? actionError} />
      {!modules ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : modules.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No modules installed yet. An admin can install them from the marketplace below.
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {modules.map((mod) => (
            <li key={mod.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">{mod.name}</p>
                <p className="text-xs text-muted-foreground">{mod.description}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={mod.visible ? "secondary" : "outline"}
                onClick={() => setVisible(mod, !mod.visible)}
              >
                {mod.visible ? "Shown in nav" : "Hidden"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {modules && (
        <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => reload()}>
          Refresh
        </Button>
      )}
    </SettingsCard>
  )
}

function MarketplaceCard() {
  const {
    data: catalog,
    error: catalogError,
    reload: reloadCatalog,
  } = useLoad(useCallback(() => api((c) => c.modules.catalog()), []))
  const {
    data: installed,
    error: installedError,
    reload: reloadInstalled,
    setData: setInstalled,
  } = useLoad(useCallback(() => api((c) => c.modules.installed()), []))
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const refresh = () => {
    reloadCatalog()
    reloadInstalled()
  }

  const uploadZip = (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setActionError(null)
    void file
      .arrayBuffer()
      .then((buffer) => {
        const bytes = new Uint8Array(buffer)
        let binary = ""
        for (const byte of bytes) binary += String.fromCharCode(byte)
        const contentBase64 = btoa(binary)
        return api((c) =>
          c.modules.upload({ payload: { filename: file.name, contentBase64 } }),
        )
      })
      .then(() => {
        setUploading(false)
        refresh()
      })
      .catch((cause: unknown) => {
        setUploading(false)
        setActionError(errorMessage(cause))
      })
  }

  const install = (mod: CatalogModule) => {
    setBusyId(mod.id)
    setActionError(null)
    void api((c) => c.modules.install({ payload: { moduleId: mod.id } })).then(
      () => {
        setBusyId(null)
        refresh()
      },
      (cause: unknown) => {
        setBusyId(null)
        setActionError(errorMessage(cause))
      },
    )
  }

  const uninstall = (mod: InstalledModule) => {
    if (!window.confirm(`Uninstall ${mod.name}? Everyone on this instance loses it.`)) return
    setBusyId(mod.id)
    setActionError(null)
    void api((c) => c.modules.uninstall({ params: { id: mod.id } })).then(
      () => {
        setBusyId(null)
        refresh()
      },
      (cause: unknown) => {
        setBusyId(null)
        setActionError(errorMessage(cause))
      },
    )
  }

  const setEnabled = (mod: InstalledModule, enabled: boolean) => {
    setBusyId(mod.id)
    setActionError(null)
    void api((c) => c.modules.setEnabled({ params: { id: mod.id }, payload: { enabled } })).then(
      (updated) => {
        setBusyId(null)
        setInstalled((prev) => (prev ?? []).map((m) => (m.id === updated.id ? updated : m)))
      },
      (cause: unknown) => {
        setBusyId(null)
        setActionError(errorMessage(cause))
      },
    )
  }

  return (
    <SettingsCard
      title="Module marketplace"
      description="Trusted plugins for this instance. Install from the catalog or upload a prebuilt .zip (survives Docker restarts on the modules volume). Disable may need a container restart to fully unload."
    >
      <ErrorAlert message={catalogError ?? installedError ?? actionError} />
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">Upload prebuilt plugin</p>
            <p className="text-xs text-muted-foreground">
              Zip with placard.module.json + server/ + web/ built against @placard/module-sdk.
            </p>
          </div>
          <Button type="button" size="sm" disabled={uploading} asChild>
            <label>
              {uploading ? "Uploading…" : "Choose .zip"}
              <input
                type="file"
                accept=".zip,application/zip,.placard-module"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  uploadZip(e.target.files?.[0])
                  e.target.value = ""
                }}
              />
            </label>
          </Button>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">Catalog</h3>
          <ul className="flex flex-col gap-3">
            {(catalog ?? []).map((mod) => (
              <li
                key={mod.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{mod.name}</p>
                  <p className="text-xs text-muted-foreground">{mod.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {mod.version} · {mod.source}
                    {mod.installed ? " · installed" : ""}
                  </p>
                </div>
                {!mod.installed && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId === mod.id}
                    onClick={() => install(mod)}
                  >
                    Install
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">Installed on this instance</h3>
          {(installed ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing installed yet.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {(installed ?? []).map((mod) => (
                <li key={mod.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{mod.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {mod.source} · {mod.enabled ? "Enabled" : "Disabled"}
                      {mod.loadError ? ` · ${mod.loadError}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === mod.id}
                      onClick={() => setEnabled(mod, !mod.enabled)}
                    >
                      {mod.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === mod.id}
                      onClick={() => uninstall(mod)}
                    >
                      Uninstall
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
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
