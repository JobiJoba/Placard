import { placeCategories } from "@placard/domain"
import { Plus, X } from "lucide-react"
import { type FormEvent, useState } from "react"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { api, errorMessage } from "@/lib/api"
import { categoryGroups } from "@/lib/place-categories"
import { categoryIcon, categoryLabel } from "@/lib/places"
import { useMe, useSession } from "@/session"
import { SettingsCard } from "./settings-card"

export function SettingsPlaceTypesPage() {
  const me = useMe()
  const { setMe } = useSession()
  const types = me.customPlaceTypes ?? []
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState("")

  const save = async (next: ReadonlyArray<string>, success: string) => {
    setPending(true)
    setError(null)
    setMessage("")
    try {
      setMe(await api((client) => client.me.setPlaceTypes({ payload: { types: next } })))
      setMessage(success)
      return true
    } catch (cause) {
      setError(errorMessage(cause))
      return false
    } finally {
      setPending(false)
    }
  }

  const add = async (event: FormEvent) => {
    event.preventDefault()
    const value = name.trim()
    const key = value.toLocaleLowerCase()
    if (!value) return
    if (
      [...placeCategories, ...placeCategories.map(categoryLabel), ...types, "all"].some(
        (existing) => existing.toLocaleLowerCase() === key,
      )
    ) {
      setError("That type already exists. Choose a different name.")
      return
    }
    if (await save([...types, value], `${value} added.`)) setName("")
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard
        title="Your place types"
        description="Add types that fit your places, such as Record shop or Climbing gym. They sync with your account and appear when adding, editing, and filtering places."
      >
        <div className="flex flex-col gap-4">
          <form onSubmit={(event) => void add(event)} className="flex flex-col gap-3">
            <Field>
              <FieldLabel htmlFor="place-type-name">Type name</FieldLabel>
              <Input
                id="place-type-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Record shop"
                maxLength={80}
                required
                disabled={pending || types.length >= 100}
              />
            </Field>
            <Button
              type="submit"
              className="w-fit"
              disabled={pending || !name.trim() || types.length >= 100}
            >
              <Plus aria-hidden />
              {pending ? "Saving…" : "Add type"}
            </Button>
          </form>
          <ErrorAlert message={error} />
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
          {types.length > 0 ? (
            <>
              <ul className="divide-y rounded-md border px-3">
                {types.map((type) => (
                  <li key={type} className="flex items-center justify-between gap-3 py-2">
                    <span className="break-all text-sm">{type}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${type}`}
                      disabled={pending}
                      onClick={() =>
                        void save(
                          types.filter((value) => value !== type),
                          `${type} removed from your choices.`,
                        )
                      }
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">
                Removing a type from your choices keeps it on places already using it.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No custom types yet. Add your first one above.
            </p>
          )}
          {types.length >= 100 && (
            <p className="text-sm text-muted-foreground">
              You have reached the limit of 100 custom types.
            </p>
          )}
        </div>
      </SettingsCard>
      <SettingsCard
        title="Built-in types"
        description="These types are available to everyone. Places found through Google use the closest matching type."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {categoryGroups.map((group) => (
            <div key={group.label}>
              <h3 className="mb-2 text-sm font-medium">{group.label}</h3>
              <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                {group.values.map((value) => {
                  const Icon = categoryIcon(value)
                  return (
                    <li key={value} className="flex items-center gap-2">
                      <Icon aria-hidden className="size-4" />
                      {categoryLabel(value)}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </SettingsCard>
    </div>
  )
}
