import type { Invite, InviteStatus, UserSummary } from "@placard/domain"
import { DateTime } from "effect"
import { type FormEvent, useState } from "react"
import { ErrorAlert } from "@/components/error-alert"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { UserAvatar } from "@/components/user-avatar"
import { api, errorMessage } from "@/lib/api"
import { useLoad } from "@/lib/use-load"
import { useSession } from "@/session"
import { SettingsCard } from "./settings-card"

const formatDate = (value: DateTime.Utc) =>
  DateTime.toDateUtc(value).toLocaleDateString(undefined, { dateStyle: "medium" })

const loadInvites = () => api((client) => client.admin.invites())
const loadUsers = () => api((client) => client.admin.users())
const loadSettings = () => api((client) => client.admin.settings())

const statusVariant: Record<InviteStatus, "default" | "secondary" | "outline"> = {
  pending: "default",
  accepted: "secondary",
  expired: "outline",
  revoked: "outline",
}

export function SettingsPeoplePage() {
  return (
    <div className="flex flex-col gap-6">
      <HouseholdCard />
      <InvitesCard />
      <UsersCard />
    </div>
  )
}

function HouseholdCard() {
  const { refresh } = useSession()
  const { data: settings, setData, error: loadError } = useLoad(loadSettings)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const toggle = async (enabled: boolean) => {
    setPending(true)
    setError(null)
    try {
      const next = await api((client) => client.admin.setHouseholdEnabled({ payload: { enabled } }))
      setData(next)
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setPending(false)
    }
  }

  return (
    <SettingsCard
      title="Household"
      description="When on, members can share places with everyone on this instance. Private places stay private."
    >
      <div className="flex flex-col gap-3">
        <ErrorAlert message={error ?? loadError} />
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={settings?.householdEnabled ?? false}
            disabled={pending || !settings}
            onCheckedChange={(value) => void toggle(value === true)}
            aria-label="Enable household mode"
            className="mt-0.5"
          />
          <span className="flex flex-col gap-1">
            <span className="font-medium">Enable household mode</span>
            <span className="text-muted-foreground">
              Unlocks sharing, library ownership filters, and household modules later.
            </span>
          </span>
        </label>
      </div>
    </SettingsCard>
  )
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

function UsersCard() {
  const { data: users, error } = useLoad(loadUsers)
  return (
    <SettingsCard
      title="People"
      description="Everyone with an account. With household mode off, each person keeps a private library."
    >
      <ErrorAlert message={error} />
      <ul className="flex flex-col divide-y">
        {(users ?? []).map((user: UserSummary) => (
          <li key={user.id} className="flex items-center justify-between gap-3 py-2">
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar name={user.name} image={user.image} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
            </div>
            <Badge variant={user.role === "admin" ? "default" : "secondary"}>{user.role}</Badge>
          </li>
        ))}
      </ul>
    </SettingsCard>
  )
}
