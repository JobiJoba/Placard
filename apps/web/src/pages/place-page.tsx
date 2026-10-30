import {
  type Place,
  type PlaceCategory,
  type PlaceList,
  type PlaceRefreshMode,
  type PlaceStatus,
  placeCategories,
} from "@placard/domain"
import { DateTime } from "effect"
import { ArrowLeft, ChevronDown, ExternalLink, MapPinned, RefreshCw } from "lucide-react"
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { PlaceCustomFieldsSection } from "@/components/place-custom-fields"
import { PlaceMediaSection } from "@/components/place-media"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  mapsProviderLabels,
  mapsProviderOpenLabels,
  mapsUrlFor,
  orderedMapsProviders,
  useMapsProvider,
} from "@/lib/maps-provider"
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

const sleeveTone: Record<PlaceCategory, string> = {
  restaurant: "oklch(0.72 0.06 55)",
  cafe: "oklch(0.78 0.05 85)",
  bar: "oklch(0.55 0.06 30)",
  park: "oklch(0.72 0.07 145)",
  museum: "oklch(0.7 0.04 250)",
  cinema: "oklch(0.58 0.05 320)",
  hotel: "oklch(0.74 0.04 220)",
  trail: "oklch(0.68 0.07 130)",
  other: "oklch(0.7 0.03 70)",
}

const priceLabels: Record<string, string> = {
  free: "Free",
  inexpensive: "Inexpensive",
  moderate: "Moderate",
  expensive: "Expensive",
  very_expensive: "Very expensive",
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
  const [editing, setEditing] = useState(false)
  const [alreadyBanner, setAlreadyBanner] = useState(alreadySaved)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshDone, setRefreshDone] = useState(false)
  const [mapsProvider] = useMapsProvider()

  useEffect(() => {
    if (!place) {
      document.title = "Placard"
      return
    }
    document.title = `${place.name} · Placard`
    return () => {
      document.title = "Placard"
    }
  }, [place])

  useEffect(() => {
    if (!refreshDone) return
    const timer = window.setTimeout(() => setRefreshDone(false), 4_000)
    return () => window.clearTimeout(timer)
  }, [refreshDone])

  const membershipLists = useMemo(() => {
    if (!place || !lists) return []
    const byId = new Map(lists.map((l) => [l.id, l]))
    return place.listIds.flatMap((listId) => {
      const list = byId.get(listId)
      return list ? [list] : []
    })
  }, [place, lists])

  const remove = () =>
    api((c) => c.places.remove({ params: { id } })).then(
      () => navigate("/deleted", { replace: true }),
      (cause: unknown) => setRemoveError(errorMessage(cause)),
    )

  const refresh = (mode: PlaceRefreshMode = "merge") => {
    setRefreshing(true)
    setRefreshError(null)
    setRefreshDone(false)
    void api((c) => c.places.refresh({ params: { id }, payload: { mode } })).then(
      (next) => {
        setData(next)
        setRefreshing(false)
        setRefreshDone(true)
      },
      (cause: unknown) => {
        setRefreshError(errorMessage(cause))
        setRefreshing(false)
      },
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-start gap-4 pb-8">
        <ErrorAlert
          message={isTagged(cause, "PlaceNotFound") ? "This place isn't in your library." : error}
        />
        <BackLink />
      </div>
    )
  }
  if (!place) {
    return (
      <div className="flex flex-col gap-4 pb-8" aria-busy="true" aria-label="Loading place">
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-52 w-full rounded-sm sm:h-60 md:h-64" />
        <Skeleton className="h-10 w-48 rounded-md" />
        <Skeleton className="h-32 w-full rounded-md" />
      </div>
    )
  }

  const Icon = categoryIcons[place.category]
  const mapProviders = orderedMapsProviders(mapsProvider)
  const preferredMapsHref = mapsUrlFor(mapsProvider, place)

  return (
    <article className="flex flex-col gap-6 pb-10 md:gap-8 md:pb-0">
      <BackLink />
      {alreadyBanner && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>This place is already in your library.</span>
            <Button size="sm" variant="ghost" onClick={() => setAlreadyBanner(false)}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <PlaceHero place={place} Icon={Icon} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0">
          <Button asChild className="min-h-11 rounded-r-none sm:min-h-8">
            <a href={preferredMapsHref} target="_blank" rel="noreferrer" className="gap-1.5">
              <MapPinned aria-hidden />
              <span className="truncate">{mapsProviderOpenLabels[mapsProvider]}</span>
              <ExternalLink aria-hidden className="size-3.5 opacity-80" />
            </a>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                className="min-h-11 rounded-l-none border-l border-[color-mix(in_srgb,var(--action-fg)_25%,transparent)] px-2 sm:min-h-8"
                aria-label={refreshing ? "Refreshing from Google" : "More maps options"}
                aria-busy={refreshing}
                disabled={refreshing}
              >
                {refreshing ? (
                  <RefreshCw aria-hidden className="size-3.5 animate-spin" />
                ) : (
                  <ChevronDown aria-hidden className="size-3.5" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48">
              {mapProviders.map((provider) => (
                <DropdownMenuItem key={provider} asChild>
                  <a
                    href={mapsUrlFor(provider, place)}
                    target="_blank"
                    rel="noreferrer"
                    className="gap-2"
                  >
                    {mapsProviderLabels[provider]}
                    {provider === mapsProvider ? (
                      <span className="ml-auto text-xs text-muted-foreground">Preferred</span>
                    ) : (
                      <ExternalLink aria-hidden className="ml-auto size-3.5 opacity-60" />
                    )}
                  </a>
                </DropdownMenuItem>
              ))}
              {place.googlePlaceId ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={refreshing}
                    onSelect={() => {
                      void refresh("merge")
                    }}
                  >
                    <RefreshCw aria-hidden className={refreshing ? "animate-spin" : undefined} />
                    {refreshing ? "Refreshing…" : "Refresh from Google"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={refreshing}
                    onSelect={() => {
                      if (
                        !window.confirm(
                          "Force full refresh? This replaces Google details and any overrides to name, category, address, and phone. Notes, lists, tags, and custom fields stay.",
                        )
                      ) {
                        return
                      }
                      void refresh("replace")
                    }}
                  >
                    <RefreshCw aria-hidden className={refreshing ? "animate-spin" : undefined} />
                    Force full refresh…
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 sm:min-h-8"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
        >
          {editing ? "Close edit" : "Edit"}
        </Button>
      </div>
      {refreshing ? (
        <Alert aria-live="polite">
          <AlertDescription className="flex items-center gap-2">
            <RefreshCw aria-hidden className="size-4 shrink-0 animate-spin" />
            Updating details from Google…
          </AlertDescription>
        </Alert>
      ) : null}
      {refreshDone && !refreshing ? (
        <Alert aria-live="polite">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>Details updated from Google.</span>
            <Button size="sm" variant="ghost" onClick={() => setRefreshDone(false)}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <ErrorAlert message={refreshError} />

      {editing ? (
        <EditPlace
          place={place}
          lists={lists ?? []}
          onSaved={(next) => {
            setData(next)
            reload()
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <PlaceRecordSection place={place} membershipLists={membershipLists} />
      )}

      <PlaceCustomFieldsSection
        place={place}
        onChanged={(next) => {
          setData(next)
        }}
      />

      <PlaceFactsSection place={place} />

      <PlaceMediaSection placeId={place.id} />

      <details className="border-t pt-4 text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Record details
        </summary>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          <dt className="text-muted-foreground">Coordinates</dt>
          <dd className="tabular-nums">{formatCoordinates(place)}</dd>
          <dt className="text-muted-foreground">Added</dt>
          <dd>
            {DateTime.formatLocal(place.createdAt, { dateStyle: "medium" })} ·{" "}
            {sourceLabels[place.source]}
          </dd>
        </dl>
      </details>

      <div className="flex flex-col items-start gap-3 border-t pt-6 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <ErrorAlert message={removeError} />
        {confirming ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Remove {place.name}? It moves to Recently deleted for 30 days, then is purged with its
              photos.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="destructive"
                className="min-h-11 sm:min-h-8"
                onClick={() => void remove()}
              >
                Remove
              </Button>
              <Button
                variant="ghost"
                className="min-h-11 sm:min-h-8"
                onClick={() => setConfirming(false)}
              >
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="min-h-11 text-muted-foreground sm:min-h-8"
            onClick={() => setConfirming(true)}
          >
            Remove from library
          </Button>
        )}
      </div>
    </article>
  )
}

function PlaceHero({
  place,
  Icon,
}: {
  readonly place: Place
  readonly Icon: (typeof categoryIcons)[PlaceCategory]
}) {
  const coverSrc = place.coverThumbUrl
  return (
    <header className="relative h-52 w-full overflow-hidden rounded-sm bg-[var(--crate)] text-[var(--parchment)] sm:h-60 md:h-64">
      {coverSrc ? (
        <>
          <img
            src={coverSrc}
            alt=""
            className="absolute inset-0 size-full object-cover"
            loading="eager"
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: [
                "linear-gradient(to top, var(--crate) 0%, color-mix(in srgb, var(--crate) 55%, transparent) 42%, transparent 68%)",
                "linear-gradient(to bottom, color-mix(in srgb, var(--crate) 70%, transparent) 0%, transparent 36%)",
              ].join(", "),
            }}
            aria-hidden
          />
        </>
      ) : (
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background: `linear-gradient(160deg, ${sleeveTone[place.category]} 0%, color-mix(in srgb, var(--crate) 55%, ${sleeveTone[place.category]}) 55%, var(--crate) 100%)`,
          }}
          aria-hidden
        />
      )}
      {place.status && (
        <span
          role="img"
          className={`absolute top-0 left-0 z-[1] w-full ${
            place.status === "been_there" ? "status-density-been" : "status-density-want"
          }`}
          aria-label={statusLabels[place.status]}
          title={statusLabels[place.status]}
        />
      )}
      <div className="relative z-[1] flex h-full flex-col justify-between gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="secondary"
            className="w-fit gap-1.5 border-0 bg-[color-mix(in_srgb,var(--crate)_55%,transparent)] text-[var(--parchment)]"
          >
            <Icon aria-hidden className="size-3.5" /> {categoryLabels[place.category]}
          </Badge>
          {place.status ? (
            <Badge
              variant="outline"
              className="border-[color-mix(in_srgb,var(--parchment)_35%,transparent)] bg-[color-mix(in_srgb,var(--crate)_40%,transparent)] text-[var(--parchment)]"
            >
              {statusLabels[place.status]}
            </Badge>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-col gap-1.5">
          <h1 className="font-catalog text-3xl font-semibold leading-tight tracking-wide uppercase sm:text-4xl">
            {place.name}
          </h1>
          {place.address ? (
            <p className="max-w-prose text-sm text-[color-mix(in_srgb,var(--parchment)_78%,transparent)] sm:text-base">
              {place.address}
            </p>
          ) : null}
          {place.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {place.tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="border-0 bg-[color-mix(in_srgb,var(--parchment)_18%,transparent)] text-[var(--parchment)]"
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}

function PlaceRecordSection({
  place,
  membershipLists,
}: {
  readonly place: Place
  readonly membershipLists: ReadonlyArray<PlaceList>
}) {
  const hasNotes = Boolean(place.notes?.trim())
  const hasLists = membershipLists.length > 0
  if (!hasNotes && !hasLists) return null

  return (
    <section className="flex flex-col gap-4 border-t pt-6" aria-labelledby="place-record-heading">
      <h2 id="place-record-heading" className="text-lg font-medium">
        In your library
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        {hasNotes ? (
          <>
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="whitespace-pre-wrap">{place.notes}</dd>
          </>
        ) : null}
        {hasLists ? (
          <>
            <dt className="text-muted-foreground">Lists</dt>
            <dd className="flex flex-wrap gap-1">
              {membershipLists.map((list) => (
                <Badge key={list.id} variant="secondary">
                  {list.name}
                </Badge>
              ))}
            </dd>
          </>
        ) : null}
      </dl>
    </section>
  )
}

function PlaceFactsSection({ place }: { readonly place: Place }) {
  const { facts } = place
  const weekday = facts.openingHours?.weekdayDescriptions
  const hours = useMemo(() => splitHours(weekday), [weekday])
  const [hoursOpen, setHoursOpen] = useState(false)

  const hasFacts =
    facts.phone ||
    facts.website ||
    facts.rating != null ||
    facts.priceLevel ||
    facts.cuisine ||
    (weekday && weekday.length > 0)

  if (!hasFacts) return null

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
        {facts.phone && (
          <>
            <dt className="text-muted-foreground">Phone</dt>
            <dd>
              <a href={`tel:${facts.phone}`} className="underline underline-offset-2">
                {facts.phone}
              </a>
            </dd>
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
                className="break-all underline underline-offset-2"
              >
                {friendlyWebsite(facts.website)}
              </a>
            </dd>
          </>
        )}
        {weekday && weekday.length > 0 && (
          <>
            <dt className="text-muted-foreground">Hours</dt>
            <dd>
              {hours.today ? (
                <div className="flex flex-col gap-1">
                  <p>
                    <span className="font-medium">Today</span> —{" "}
                    {hours.today.replace(/^[^:]+:\s*/, "")}
                  </p>
                  {hours.rest.length > 0 ? (
                    <>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto w-fit px-0"
                        onClick={() => setHoursOpen((v) => !v)}
                        aria-expanded={hoursOpen}
                      >
                        {hoursOpen ? "Hide full week" : "Show full week"}
                      </Button>
                      {hoursOpen ? (
                        <ul className="flex flex-col gap-0.5 text-muted-foreground">
                          {weekday.map((line) => (
                            <li
                              key={line}
                              className={
                                line === hours.today ? "font-medium text-foreground" : undefined
                              }
                            >
                              {line}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {weekday.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </dd>
          </>
        )}
      </dl>
    </section>
  )
}

function friendlyWebsite(url: string): string {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, "")
    const path = parsed.pathname === "/" ? "" : parsed.pathname
    const display = `${host}${path}`
    return display.length > 48 ? `${display.slice(0, 46)}…` : display
  } catch {
    return url.replace(/^https?:\/\//, "")
  }
}

function splitHours(descs: ReadonlyArray<string> | null | undefined): {
  readonly today: string | null
  readonly rest: ReadonlyArray<string>
} {
  if (!descs || descs.length === 0) return { today: null, rest: [] }
  const day = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date())
  const today = descs.find((line) => line.toLowerCase().startsWith(day.toLowerCase())) ?? null
  return { today, rest: descs.filter((line) => line !== today) }
}

function EditPlace({
  place,
  lists,
  onSaved,
  onCancel,
}: {
  readonly place: Place
  readonly lists: ReadonlyArray<PlaceList>
  readonly onSaved: (place: Place) => void
  readonly onCancel: () => void
}) {
  const [name, setName] = useState(place.name)
  const [category, setCategory] = useState<PlaceCategory>(place.category)
  const [address, setAddress] = useState(place.address ?? "")
  const [notes, setNotes] = useState(place.notes ?? "")
  const [phone, setPhone] = useState(place.facts.phone ?? "")
  const [status, setStatus] = useState<PlaceStatus | "none">(place.status ?? "none")
  const [tagNames, setTagNames] = useState(place.tags.map((t) => t.name).join(", "))
  const [listIds, setListIds] = useState<ReadonlySet<string>>(new Set(place.listIds))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(place.name)
    setCategory(place.category)
    setAddress(place.address ?? "")
    setNotes(place.notes ?? "")
    setPhone(place.facts.phone ?? "")
    setStatus(place.status ?? "none")
    setTagNames(place.tags.map((t) => t.name).join(", "))
    setListIds(new Set(place.listIds))
  }, [place])

  const toggleList = (listId: string) =>
    setListIds((prev) => {
      const next = new Set(prev)
      if (next.has(listId)) next.delete(listId)
      else next.add(listId)
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
    const phoneValue = phone.trim() || null
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
        await api((c) =>
          c.places.setFact({
            params: { id: place.id, key: "phone" },
            payload: { value: phoneValue },
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
    <form
      onSubmit={save}
      className="filter-sheet flex flex-col gap-4 rounded-md p-4"
      aria-labelledby="place-edit-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="place-edit-heading" className="text-lg font-medium">
          Edit
        </h2>
        <p className="text-xs text-muted-foreground">Your phone number survives a refresh from Google.</p>
      </div>

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
          <FieldLabel htmlFor="place-phone">Phone</FieldLabel>
          <Input
            id="place-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Not set"
            className="max-w-xs"
          />
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
                <li key={list.id} className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
                  <input
                    type="checkbox"
                    id={`list-${list.id}`}
                    checked={listIds.has(list.id)}
                    onChange={() => toggleList(list.id)}
                    className="size-4"
                  />
                  <label htmlFor={`list-${list.id}`}>{list.name}</label>
                </li>
              ))}
            </ul>
          </Field>
        )}
      </FieldGroup>
      <ErrorAlert message={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11 w-fit sm:min-h-8" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 sm:min-h-8"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

function BackLink() {
  const navigate = useNavigate()
  return (
    <Button
      type="button"
      variant="ghost"
      className="-ml-2 min-h-11 w-fit sm:min-h-8"
      onClick={() => {
        if (window.history.length > 1) navigate(-1)
        else navigate("/")
      }}
    >
      <ArrowLeft /> Back
    </Button>
  )
}
