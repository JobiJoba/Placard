import type { DistanceUnit } from "@placard/domain"
import { type FormEvent, useState } from "react"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { api, errorMessage } from "@/lib/api"
import { changePassword } from "@/lib/auth-client"
import { useMe, useSession } from "@/session"
import { SettingsCard } from "./settings-card"

export function SettingsGeneralPage() {
  return (
    <div className="flex flex-col gap-6">
      <AccountCard />
      <DistanceUnitCard />
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
