import {
  appleMapsUrl,
  googleMapsUrl,
  organicMapsUrl,
  type Place,
  type PlaceCategory,
  type PlaceList,
  type PlaceStatus,
  placeCategories,
} from "@placard/domain"
import { DateTime } from "effect"
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react"
import { type FormEvent, useCallback, useEffect, useState } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { PlaceMediaSection } from "@/components/place-media"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { api, errorMessage, isTagged } from "@/lib/api"
import {
  categoryIcons,
  categoryLabels,
  formatCoordinates,
  sourceLabels,
  statusLabels,
} from "@/lib/places"
import { useLoad } from "@/lib/use-load"

/** Set as router state when an add flow lands on a place the user already had. */
export interface PlacePageState {
  readonly alreadySaved?: boolean
}

export function PlacePage() {
  const { id = "" } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const alreadySaved = (location.state as PlacePageState | null)?.alreadySaved === true
  const {
    data: place,
    setData,
    error,
    cause,
    reload,
  } = useLoad(useCallback(() => api((c) => c.places.get({ params: { id } })), [id]))
  const { data: lists } = useLoad(useCallback(() => api((c) => c.lists.list()), []))
  const [confirming, setConfirming] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const remove = () =>
    api((c) => c.places.remove({ params: { id } })).then(
      () => navigate("/", { replace: true }),
      (cause: unknown) => setRemoveError(errorMessage(cause)),
    )

  const refresh = () => {
    setRefreshing(true)
    setRefreshError(null)
    void api((c) => c.places.refresh({ params: { id } })).then(
      (next) => {
        setData(next)
        setRefreshing(false)
      },
      (cause: unknown) => {
        setRefreshError(errorMessage(cause))
        setRefreshing(false)
      },
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-start gap-4">
        <ErrorAlert
          message={isTagged(cause, "PlaceNotFound") ? "This place isn't in your library." : error}
        />
        <BackLink />
      </div>
    )
  }
  if (!place) return <Skeleton className="h-64 rounded-xl" />

  const Icon = categoryIcons[place.category]
  const links = [
    { label: "Open in Google Maps", href: googleMapsUrl(place) },
    { label: "Open in Apple Maps", href: appleMapsUrl(place) },
    { label: "Open in Organic Maps", href: organicMapsUrl(place) },
  ]

  return (
    <article className="flex flex-col gap-8">
      <BackLink />
      {alreadySaved && (
        <Alert>
          <AlertDescription>This place is already in your library.</AlertDescription>
        </Alert>
      )}
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="w-fit gap-1.5">
            <Icon aria-hidden /> {categoryLabels[place.category]}
          </Badge>
          {place.status && <Badge variant="outline">{statusLabels[place.status]}</Badge>}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{place.name}</h1>
        {place.address && <p className="text-muted-foreground">{place.address}</p>}
        {place.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {place.tags.map((tag) => (
              <Badge key={tag.id} variant="secondary">
                {tag.name}
              </Badge>
            ))}
          </div>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Button key={link.label} asChild variant="outline">
            <a href={link.href} target="_blank" rel="noreferrer">
              {link.label} <ExternalLink aria-hidden />
            </a>
          </Button>
        ))}
        {place.googlePlaceId && (
          <Button variant="outline" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw aria-hidden className={refreshing ? "animate-spin" : undefined} />
            {refreshing ? "Refreshing…" : "Refresh from Google"}
          </Button>
        )}
      </div>
      <ErrorAlert message={refreshError} />

      <PlaceFactsSection
        place={place}
        onSaved={(next) => {
          setData(next)
        }}
      />

      <PlaceMediaSection placeId={place.id} category={place.category} />

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Coordinates</dt>
        <dd className="tabular-nums">{formatCoordinates(place)}</dd>
        <dt className="text-muted-foreground">Added</dt>
        <dd>
          {DateTime.formatLocal(place.createdAt, { dateStyle: "medium" })} ·{" "}
          {sourceLabels[place.source]}
        </dd>
      </dl>

      <EditPlace
        place={place}
        lists={lists ?? []}
        onSaved={(next) => {
          setData(next)
          reload()
        }}
      />

      <div className="flex flex-col items-start gap-3 border-t pt-6">
        <ErrorAlert message={removeError} />
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Remove {place.name} from your library?</span>
            <Button variant="destructive" size="sm" onClick={() => void remove()}>
              Remove
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            Remove from library
          </Button>
        )}
      </div>
    </article>
  )
}

const priceLabels: Record<string, string> = {
  free: "Free",
  inexpensive: "Inexpensive",
  moderate: "Moderate",
  expensive: "Expensive",
  very_expensive: "Very expensive",
}

function PlaceFactsSection({
  place,
  onSaved,
}: {
  readonly place: Place
  readonly onSaved: (place: Place) => void
}) {
  const { facts } = place
  const hasFacts =
    facts.phone ||
    facts.website ||
    facts.rating != null ||
    facts.priceLevel ||
    facts.cuisine ||
    facts.openingHours ||
    (facts.types && facts.types.length > 0)
  const [phone, setPhone] = useState(facts.phone ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPhone(facts.phone ?? "")
  }, [facts.phone])

  const savePhone = (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const value = phone.trim() || null
    void api((c) =>
      c.places.setFact({
        params: { id: place.id, key: "phone" },
        payload: { value },
      }),
    ).then(
      (next) => {
        onSaved(next)
        setPhone(next.facts.phone ?? "")
        setSaving(false)
      },
      (cause: unknown) => {
        setError(errorMessage(cause))
        setSaving(false)
      },
    )
  }

  const clearPhone = () => {
    setSaving(true)
    setError(null)
    void api((c) => c.places.clearFactOverride({ params: { id: place.id, key: "phone" } })).then(
      (next) => {
        onSaved(next)
        setPhone(next.facts.phone ?? "")
        setSaving(false)
      },
      (cause: unknown) => {
        setError(errorMessage(cause))
        setSaving(false)
      },
    )
  }

  if (!hasFacts && !place.googlePlaceId) return null

  return (
    <section className="flex flex-col gap-4 border-t pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">Details</h2>
        {facts.fromGoogle && (
          <p className="text-xs text-muted-foreground">
            Place data from{" "}
            <a
              href="https://maps.google.com"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Google
            </a>
          </p>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {facts.cuisine && (
          <>
            <dt className="text-muted-foreground">Cuisine</dt>
            <dd>{facts.cuisine}</dd>
          </>
        )}
        {facts.rating != null && (
          <>
            <dt className="text-muted-foreground">Rating</dt>
            <dd className="tabular-nums">{facts.rating.toFixed(1)}★</dd>
          </>
        )}
        {facts.priceLevel && (
          <>
            <dt className="text-muted-foreground">Price</dt>
            <dd>{priceLabels[facts.priceLevel] ?? facts.priceLevel}</dd>
          </>
        )}
        {facts.website && (
          <>
            <dt className="text-muted-foreground">Website</dt>
            <dd>
              <a
                href={facts.website}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                {facts.website.replace(/^https?:\/\//, "")}
              </a>
            </dd>
          </>
        )}
        {facts.openingHours?.weekdayDescriptions && (
          <>
            <dt className="text-muted-foreground">Hours</dt>
            <dd>
              <ul className="flex flex-col gap-0.5">
                {facts.openingHours.weekdayDescriptions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>
      <form onSubmit={savePhone} className="flex flex-col gap-2">
        <Field>
          <FieldLabel htmlFor="place-phone">Phone</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <Input
              id="place-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="max-w-xs"
              placeholder="Not set"
            />
            <Button type="submit" size="sm" variant="secondary" disabled={saving}>
              {saving ? "Saving…" : "Save phone"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => void clearPhone()}
            >
              Use Google
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Your phone number survives a refresh from Google.
          </p>
        </Field>
        <ErrorAlert message={error} />
      </form>
    </section>
  )
}

function EditPlace({
  place,
  lists,
  onSaved,
}: {
  readonly place: Place
  readonly lists: ReadonlyArray<PlaceList>
  readonly onSaved: (place: Place) => void
}) {
  const [name, setName] = useState(place.name)
  const [category, setCategory] = useState<PlaceCategory>(place.category)
  const [address, setAddress] = useState(place.address ?? "")
  const [notes, setNotes] = useState(place.notes ?? "")
  const [status, setStatus] = useState<PlaceStatus | "none">(place.status ?? "none")
  const [tagNames, setTagNames] = useState(place.tags.map((t) => t.name).join(", "))
  const [listIds, setListIds] = useState<ReadonlySet<string>>(new Set(place.listIds))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleList = (id: string) =>
    setListIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const save = (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const names = tagNames
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
    void (async () => {
      try {
        await api((c) =>
          c.places.update({
            params: { id: place.id },
            payload: {
              name,
              category,
              address: address.trim() || null,
              notes: notes.trim() || null,
              status: status === "none" ? null : status,
            },
          }),
        )
        await api((c) => c.places.setTags({ params: { id: place.id }, payload: { names } }))
        const next = await api((c) =>
          c.places.setLists({
            params: { id: place.id },
            payload: { listIds: [...listIds] },
          }),
        )
        onSaved(next)
        setSaving(false)
      } catch (cause) {
        setError(errorMessage(cause))
        setSaving(false)
      }
    })()
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 border-t pt-6">
      <h2 className="text-lg font-medium">Edit</h2>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="place-name">Name</FieldLabel>
          <Input id="place-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="place-category">Type</FieldLabel>
          <Select value={category} onValueChange={(v) => setCategory(v as PlaceCategory)}>
            <SelectTrigger id="place-category" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {placeCategories.map((value) => (
                <SelectItem key={value} value={value}>
                  {categoryLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="place-status">Status</FieldLabel>
          <Select value={status} onValueChange={(v) => setStatus(v as PlaceStatus | "none")}>
            <SelectTrigger id="place-status" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No status</SelectItem>
              <SelectItem value="want_to_go">Want to go</SelectItem>
              <SelectItem value="been_there">Been there</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="place-address">Address</FieldLabel>
          <Input id="place-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="place-notes">Notes</FieldLabel>
          <Textarea
            id="place-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="place-tags">Tags</FieldLabel>
          <Input
            id="place-tags"
            value={tagNames}
            onChange={(e) => setTagNames(e.target.value)}
            placeholder="date-night, pizza"
          />
          <p className="text-xs text-muted-foreground">Comma-separated. New names create tags.</p>
        </Field>
        {lists.length > 0 && (
          <Field>
            <FieldLabel>Lists</FieldLabel>
            <ul className="flex flex-col gap-2">
              {lists.map((list) => (
                <li key={list.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    id={`list-${list.id}`}
                    checked={listIds.has(list.id)}
                    onChange={() => toggleList(list.id)}
                  />
                  <label htmlFor={`list-${list.id}`}>{list.name}</label>
                </li>
              ))}
            </ul>
          </Field>
        )}
      </FieldGroup>
      <ErrorAlert message={error} />
      <Button type="submit" className="w-fit" disabled={saving}>
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </form>
  )
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
      <Link to="/">
        <ArrowLeft /> Library
      </Link>
    </Button>
  )
}
