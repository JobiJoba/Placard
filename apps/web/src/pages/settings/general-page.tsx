import type { DistanceUnit } from "@placard/domain"
import { type FormEvent, useEffect, useRef, useState } from "react"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { UserAvatar } from "@/components/user-avatar"
import { api, errorMessage } from "@/lib/api"
import { changePassword } from "@/lib/auth-client"
import { isLibraryDensity, LIBRARY_DENSITIES, useLibraryDensity } from "@/lib/library-density"
import {
  isMapsProvider,
  MAPS_PROVIDERS,
  mapsProviderLabels,
  useMapsProvider,
} from "@/lib/maps-provider"
import { useMe, useSession } from "@/session"
import { SettingsCard } from "./settings-card"

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Could not read file."))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== "string") {
        reject(new Error("Could not read file."))
        return
      }
      const comma = result.indexOf(",")
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(file)
  })

export function SettingsGeneralPage() {
  return (
    <div className="flex flex-col gap-6">
      <ProfileCard />
      <PasswordCard />
      <DistanceUnitCard />
      <MapsProviderCard />
      <LibraryDensityCard />
      <ExportLibraryCard />
    </div>
  )
}

function ProfileCard() {
  const me = useMe()
  const { setMe, signOut } = useSession()
  const [name, setName] = useState(me.name)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pending, setPending] = useState(false)
  const [avatarPending, setAvatarPending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setName(me.name)
  }, [me.name])

  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next = name.trim()
    if (!next) {
      setError("Enter a name.")
      setOk(false)
      return
    }
    setPending(true)
    setError(null)
    setOk(false)
    try {
      setMe(await api((client) => client.me.updateProfile({ payload: { name: next } })))
      setOk(true)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setPending(false)
    }
  }

  const onPickAvatar = async (list: FileList | null) => {
    const file = [...(list ?? [])].find((f) => f.type.startsWith("image/"))
    if (!file) return
    setAvatarPending(true)
    setError(null)
    setOk(false)
    try {
      const contentBase64 = await fileToBase64(file)
      setMe(
        await api((client) =>
          client.me.setAvatar({
            payload: {
              filename: file.name || "avatar.jpg",
              mimeType: file.type || "image/jpeg",
              contentBase64,
            },
          }),
        ),
      )
      setOk(true)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setAvatarPending(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const clearAvatar = async () => {
    setAvatarPending(true)
    setError(null)
    setOk(false)
    try {
      setMe(await api((client) => client.me.clearAvatar()))
      setOk(true)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setAvatarPending(false)
    }
  }

  return (
    <SettingsCard title="Profile" description={`${me.email}. Your name and photo across Placard.`}>
      <form onSubmit={saveName} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <UserAvatar name={name || me.name} image={me.image} className="size-14 text-lg" />
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Choose avatar image"
              onChange={(event) => void onPickAvatar(event.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={avatarPending}
              onClick={() => fileRef.current?.click()}
            >
              {avatarPending ? "Uploading…" : "Change photo"}
            </Button>
            {me.image && (
              <Button
                type="button"
                variant="ghost"
                disabled={avatarPending}
                onClick={() => void clearAvatar()}
              >
                Remove photo
              </Button>
            )}
          </div>
        </div>
        <Field>
          <FieldLabel htmlFor="profileName">Name</FieldLabel>
          <Input
            id="profileName"
            name="profileName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
            autoComplete="name"
          />
        </Field>
        <ErrorAlert message={error} />
        {ok && <p className="text-sm text-muted-foreground">Profile updated.</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || name.trim() === me.name}>
            {pending ? "Saving…" : "Save name"}
          </Button>
          <Button type="button" variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </form>
    </SettingsCard>
  )
}

function PasswordCard() {
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
    <SettingsCard title="Password" description="Change the password for this account.">
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
        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Updating…" : "Change password"}
        </Button>
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

function MapsProviderCard() {
  const [provider, setProvider] = useMapsProvider()

  return (
    <SettingsCard
      title="Maps app"
      description="Default app for Open in maps on place pages. Stored on this device."
    >
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={0}
        value={provider}
        onValueChange={(value) => {
          if (isMapsProvider(value)) setProvider(value)
        }}
        aria-label="Preferred maps app"
        className="flex-wrap"
      >
        {MAPS_PROVIDERS.map((id) => (
          <ToggleGroupItem key={id} value={id}>
            {mapsProviderLabels[id]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </SettingsCard>
  )
}

function LibraryDensityCard() {
  const [density, setDensity] = useLibraryDensity()

  return (
    <SettingsCard
      title="Library grid"
      description="How many place cards fit across a typical desktop row. Stored on this device."
    >
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={0}
        value={String(density)}
        onValueChange={(value) => {
          const next = Number(value)
          if (isLibraryDensity(next)) setDensity(next)
        }}
        aria-label="Library cards per row"
      >
        {LIBRARY_DENSITIES.map((n) => (
          <ToggleGroupItem key={n} value={String(n)}>
            {n}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </SettingsCard>
  )
}

function ExportLibraryCard() {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const download = async () => {
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/export", { credentials: "include" })
      if (!response.ok) {
        setError(response.status === 401 ? "Sign in to export." : "Export failed.")
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = "placard-export.zip"
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed.")
    } finally {
      setPending(false)
    }
  }

  return (
    <SettingsCard
      title="Export library"
      description="Download your places, lists, tags, and media as a zip (JSON + GeoJSON). Instance backup still uses pg_dump + volumes."
    >
      <div className="flex flex-col gap-3">
        <ErrorAlert message={error} />
        <Button type="button" variant="outline" disabled={pending} onClick={() => void download()}>
          {pending ? "Preparing…" : "Download export.zip"}
        </Button>
      </div>
    </SettingsCard>
  )
}
