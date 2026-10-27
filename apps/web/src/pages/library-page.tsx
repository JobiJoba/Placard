import {
  type BulkAction,
  placeCategories as categories,
  type OpenWhen,
  type Place,
  type PlaceCategory,
  type PlaceList,
  type PlaceStatus,
  type SearchFilter,
  type SearchHit,
  type TagSummary,
} from "@placard/domain"
import { LayoutGrid, Map as MapIcon, Plus, Trash2 } from "lucide-react"
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { api, errorMessage } from "@/lib/api"
import { requestLocation } from "@/lib/geolocation"
import { categoryIcons, categoryLabels, formatDistance, statusLabels } from "@/lib/places"
import { useLoad } from "@/lib/use-load"
import { useMe } from "@/session"

const ResultsMap = lazy(() => import("@/components/library/results-map"))

type Scope = "near" | "city" | "all"

const parseOpen = (value: string | null): OpenWhen | undefined =>
  value === "now" || value === "tonight" ? value : undefined

const parseCategory = (value: string | null): PlaceCategory | undefined =>
  value && (categories as ReadonlyArray<string>).includes(value)
    ? (value as PlaceCategory)
    : undefined

export function LibraryPage() {
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const text = params.get("q") ?? ""
  const tag = params.get("tag") ?? undefined
  const list = params.get("list") ?? undefined
  const status = (params.get("status") as PlaceStatus | null) ?? undefined
  const open = parseOpen(params.get("open"))
  const category = parseCategory(params.get("category"))
  const scope = (params.get("scope") as Scope | null) ?? "all"
  const radiusKm = Number(params.get("radius") ?? "5") || 5
  const view = params.get("view") === "map" ? "map" : "grid"
  const cityLat = params.get("lat") ? Number(params.get("lat")) : null
  const cityLng = params.get("lng") ? Number(params.get("lng")) : null

  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null)
  const [geoSource, setGeoSource] = useState<"browser" | "ip" | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoAttempt, setGeoAttempt] = useState(0)
  const [textDraft, setTextDraft] = useState(text)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [newListName, setNewListName] = useState("")

  const { data: mapsConfig } = useLoad(useCallback(() => api((c) => c.google.config()), []))
  const { data: tags } = useLoad(useCallback(() => api((c) => c.tags.list()), []))
  const { data: lists } = useLoad(useCallback(() => api((c) => c.lists.list()), []))

  useEffect(() => {
    setTextDraft(text)
  }, [text])

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (textDraft === text) return
      const next = new URLSearchParams(params)
      if (textDraft.trim()) next.set("q", textDraft.trim())
      else next.delete("q")
      setParams(next, { replace: true })
      setSelected(new Set())
    }, 250)
    return () => window.clearTimeout(id)
  }, [textDraft, text, params, setParams])

  useEffect(() => {
    if (scope !== "near") return
    // geoAttempt is a retry counter — bumping it re-runs this effect.
    void geoAttempt
    let cancelled = false
    setGeoLoading(true)
    setGeoError(null)
    void requestLocation().then((result) => {
      if (cancelled) return
      setGeoLoading(false)
      if (result.ok) {
        setNear({ lat: result.lat, lng: result.lng })
        setGeoSource(result.source)
        setGeoError(null)
      } else {
        setGeoSource(null)
        setGeoError(result.message)
      }
    })
    return () => {
      cancelled = true
    }
  }, [scope, geoAttempt])

  // If the user grants permission after a denial, try again automatically.
  useEffect(() => {
    if (scope !== "near" || !navigator.permissions?.query) return
    let permission: PermissionStatus | undefined
    let cancelled = false
    void navigator.permissions.query({ name: "geolocation" }).then((status) => {
      if (cancelled) return
      permission = status
      status.onchange = () => {
        if (status.state === "granted") setGeoAttempt((n) => n + 1)
      }
    })
    return () => {
      cancelled = true
      if (permission) permission.onchange = null
    }
  }, [scope])

  const filter: SearchFilter = useMemo(() => {
    const next: SearchFilter = {
      ...(text.trim() ? { text: text.trim() } : {}),
      ...(tag ? { tag } : {}),
      ...(list ? { list } : {}),
      ...(status ? { status } : {}),
      ...(open ? { open } : {}),
      ...(category ? { category } : {}),
    }
    if (scope === "near" && near) {
      return { ...next, near, radiusKm }
    }
    if (scope === "city" && cityLat != null && cityLng != null && !Number.isNaN(cityLat)) {
      return { ...next, near: { lat: cityLat, lng: cityLng }, radiusKm }
    }
    return next
  }, [text, tag, list, status, open, category, scope, near, radiusKm, cityLat, cityLng])

  const waitingForGeo = scope === "near" && !near && !geoError

  const {
    data: hits,
    error,
    reload,
  } = useLoad(
    useCallback(() => {
      if (waitingForGeo) return Promise.resolve([] as SearchHit[])
      return api((c) => c.search.query({ payload: filter }))
    }, [filter, waitingForGeo]),
  )

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    setSelected(new Set())
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const clearSelection = () => setSelected(new Set())

  const runBulk = (action: BulkAction) => {
    const placeIds = [...selected]
    if (placeIds.length === 0) return
    setBulkError(null)
    api((c) => c.places.bulk({ payload: { placeIds, action } })).then(
      () => {
        clearSelection()
        reload()
      },
      (cause: unknown) => setBulkError(errorMessage(cause)),
    )
  }

  const createListAndAdd = () => {
    const name = newListName.trim()
    if (!name) return
    api((c) => c.lists.create({ payload: { name, description: null } })).then(
      (created) => {
        setNewListName("")
        runBulk({ _tag: "addToList", listId: created.id })
      },
      (cause: unknown) => setBulkError(errorMessage(cause)),
    )
  }

  const hasFilters = Boolean(text || tag || list || status || open || category || scope !== "all")
  const filteredEmpty = hits !== null && hits.length === 0 && hasFilters
  const mapCenter = filter.near ?? (hits?.[0] ? hits[0].place.location : null)

  if (error) return <ErrorAlert message={error} />
  if (!hits && !waitingForGeo) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    )
  }

  if (hits && hits.length === 0 && !filteredEmpty && !waitingForGeo && scope === "all") {
    return (
      <section className="flex flex-col items-center gap-3 py-16 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Your library is empty</h1>
        <p className="max-w-md text-muted-foreground">
          Welcome, {me.name}. Places you save will show up here, and only you can see them.
        </p>
        <Button asChild className="mt-2">
          <Link to="/add">
            <Plus /> Add your first place
          </Link>
        </Button>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/lists">Lists</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/deleted">
              <Trash2 /> Recently deleted
            </Link>
          </Button>
          <Button asChild>
            <Link to="/add">
              <Plus /> Add place
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Input
          value={textDraft}
          onChange={(e) => setTextDraft(e.target.value)}
          placeholder="Search name, notes, cuisine…"
          aria-label="Search library"
        />
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={scope}
            onValueChange={(value) => {
              if (value === "near" || value === "city" || value === "all")
                setParam("scope", value === "all" ? undefined : value)
            }}
            aria-label="Search area"
          >
            <ToggleGroupItem value="near">Near me</ToggleGroupItem>
            <ToggleGroupItem value="city">City</ToggleGroupItem>
            <ToggleGroupItem value="all">All</ToggleGroupItem>
          </ToggleGroup>
          {scope !== "all" && (
            <Select value={String(radiusKm)} onValueChange={(v) => setParam("radius", v)}>
              <SelectTrigger className="w-28" aria-label="Radius">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 5, 10, 25, 50].map((km) => (
                  <SelectItem key={km} value={String(km)}>
                    {km} km
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={open ?? "any"}
            onValueChange={(value) =>
              setParam("open", value === "now" || value === "tonight" ? value : undefined)
            }
            aria-label="Open filter"
          >
            <ToggleGroupItem value="any">Any hours</ToggleGroupItem>
            <ToggleGroupItem value="now">Open now</ToggleGroupItem>
            <ToggleGroupItem value="tonight">Open tonight</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={view}
            onValueChange={(value) => setParam("view", value === "map" ? "map" : undefined)}
            aria-label="Result view"
          >
            <ToggleGroupItem value="grid">
              <LayoutGrid aria-hidden /> Grid
            </ToggleGroupItem>
            <ToggleGroupItem value="map">
              <MapIcon aria-hidden /> Map
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        {scope === "city" && (
          <CityCenter
            lat={cityLat}
            lng={cityLng}
            onSet={(lat, lng) => {
              const next = new URLSearchParams(params)
              next.set("scope", "city")
              next.set("lat", String(lat))
              next.set("lng", String(lng))
              setParams(next, { replace: true })
            }}
          />
        )}
        {scope === "near" && geoSource === "ip" && !geoError && (
          <p className="text-xs text-muted-foreground">
            Using an approximate IP location — this browser couldn't use precise GPS/Wi‑Fi
            positioning.
          </p>
        )}
        {geoError && scope === "near" && (
          <div className="flex flex-col items-start gap-2">
            <ErrorAlert message={geoError} />
            <Button
              size="sm"
              variant="outline"
              disabled={geoLoading}
              onClick={() => {
                setNear(null)
                setGeoAttempt((n) => n + 1)
              }}
            >
              {geoLoading ? "Locating…" : "Try again"}
            </Button>
          </div>
        )}
        <Filters
          tags={tags ?? []}
          lists={lists ?? []}
          tag={tag}
          list={list}
          status={status}
          category={category}
          onTag={(value) => setParam("tag", value)}
          onList={(value) => setParam("list", value)}
          onStatus={(value) => setParam("status", value)}
          onCategory={(value) => setParam("category", value)}
        />
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                Tag
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {(tags ?? []).map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => runBulk({ _tag: "addTag", tagName: t.name })}
                >
                  {t.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  const name = window.prompt("New tag name")
                  if (name?.trim()) runBulk({ _tag: "addTag", tagName: name.trim() })
                }}
              >
                New tag…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                Add to list
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              {(lists ?? []).map((l) => (
                <DropdownMenuItem
                  key={l.id}
                  onClick={() => runBulk({ _tag: "addToList", listId: l.id })}
                >
                  {l.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <div className="flex gap-1 p-2">
                <Input
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="New list"
                  className="h-8"
                />
                <Button size="sm" onClick={createListAndAdd}>
                  Add
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                Status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={() => runBulk({ _tag: "setStatus", status: "want_to_go" })}
              >
                Want to go
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => runBulk({ _tag: "setStatus", status: "been_there" })}
              >
                Been there
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => runBulk({ _tag: "setStatus", status: null })}>
                Clear status
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="destructive" onClick={() => runBulk({ _tag: "delete" })}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      )}

      <ErrorAlert message={bulkError} />

      {waitingForGeo ? (
        <p className="text-sm text-muted-foreground">Getting your location…</p>
      ) : filteredEmpty ? (
        <p className="text-sm text-muted-foreground">No places match these filters.</p>
      ) : view === "map" ? (
        mapsConfig?.mapsApiKey ? (
          <Suspense fallback={<Skeleton className="h-[420px] rounded-xl" />}>
            <ResultsMap apiKey={mapsConfig.mapsApiKey} hits={hits ?? []} center={mapCenter} />
          </Suspense>
        ) : (
          <p className="text-sm text-muted-foreground">
            Add a Google Maps API key in Settings to see results on a map.
          </p>
        )
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(hits ?? []).map(({ place, distanceMeters }) => (
            <li key={place.id}>
              <PlaceCard
                place={place}
                distanceMeters={distanceMeters}
                distanceUnit={me.distanceUnit}
                selected={selected.has(place.id)}
                onToggle={() => toggle(place.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CityCenter({
  lat,
  lng,
  onSet,
}: {
  readonly lat: number | null
  readonly lng: number | null
  readonly onSet: (lat: number, lng: number) => void
}) {
  const presets = [
    { label: "Naples", lat: 40.8518, lng: 14.2681 },
    { label: "Berlin", lat: 52.52, lng: 13.405 },
    { label: "Vienna", lat: 48.2082, lng: 16.3738 },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Center:</span>
      {presets.map((city) => (
        <Button
          key={city.label}
          size="sm"
          variant={lat === city.lat && lng === city.lng ? "default" : "outline"}
          onClick={() => onSet(city.lat, city.lng)}
        >
          {city.label}
        </Button>
      ))}
      {lat != null && lng != null && (
        <span className="tabular-nums text-muted-foreground">
          {lat.toFixed(3)}, {lng.toFixed(3)}
        </span>
      )}
    </div>
  )
}

function Filters({
  tags,
  lists,
  tag,
  list,
  status,
  category,
  onTag,
  onList,
  onStatus,
  onCategory,
}: {
  readonly tags: ReadonlyArray<TagSummary>
  readonly lists: ReadonlyArray<PlaceList>
  readonly tag?: string | undefined
  readonly list?: string | undefined
  readonly status?: PlaceStatus | undefined
  readonly category?: PlaceCategory | undefined
  readonly onTag: (value: string | undefined) => void
  readonly onList: (value: string | undefined) => void
  readonly onStatus: (value: PlaceStatus | undefined) => void
  readonly onCategory: (value: PlaceCategory | undefined) => void
}) {
  const listOptions = useMemo(() => lists, [lists])
  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={category ?? "all"}
        onValueChange={(v) => onCategory(v === "all" ? undefined : (v as PlaceCategory))}
      >
        <SelectTrigger className="w-40" aria-label="Filter by type">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any type</SelectItem>
          {categories.map((value) => (
            <SelectItem key={value} value={value}>
              {categoryLabels[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={tag ?? "all"} onValueChange={(v) => onTag(v === "all" ? undefined : v)}>
        <SelectTrigger className="w-40" aria-label="Filter by tag">
          <SelectValue placeholder="Tag" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All tags</SelectItem>
          {tags.map((t) => (
            <SelectItem key={t.id} value={t.name}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={list ?? "all"} onValueChange={(v) => onList(v === "all" ? undefined : v)}>
        <SelectTrigger className="w-44" aria-label="Filter by list">
          <SelectValue placeholder="List" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All lists</SelectItem>
          {listOptions.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={status ?? "all"}
        onValueChange={(v) => onStatus(v === "all" ? undefined : (v as PlaceStatus))}
      >
        <SelectTrigger className="w-40" aria-label="Filter by status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any status</SelectItem>
          <SelectItem value="want_to_go">Want to go</SelectItem>
          <SelectItem value="been_there">Been there</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function PlaceCard({
  place,
  distanceMeters,
  distanceUnit,
  selected,
  onToggle,
}: {
  readonly place: Place
  readonly distanceMeters: number | null
  readonly distanceUnit: "km" | "mi"
  readonly selected: boolean
  readonly onToggle: () => void
}) {
  const Icon = categoryIcons[place.category]
  return (
    <div
      className={`relative flex h-full flex-col gap-3 rounded-xl bg-card p-4 ring-1 transition-shadow ${
        selected ? "ring-2 ring-foreground" : "ring-foreground/10 hover:ring-foreground/25"
      }`}
    >
      <div className="absolute top-3 right-3 z-10">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${place.name}`}
        />
      </div>
      <Link
        to={`/places/${place.id}`}
        className="flex flex-col gap-3 pr-8 focus-visible:outline-none"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="size-4" aria-hidden />
          {categoryLabels[place.category]}
          {place.status && (
            <>
              <span aria-hidden>·</span>
              {statusLabels[place.status]}
            </>
          )}
          {distanceMeters != null && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{formatDistance(distanceMeters, distanceUnit)}</span>
            </>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="font-medium leading-snug">{place.name}</h2>
          {place.address && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{place.address}</p>
          )}
          {(place.facts.cuisine || place.facts.rating != null) && (
            <p className="text-xs text-muted-foreground">
              {[
                place.facts.cuisine,
                place.facts.rating != null ? `${place.facts.rating.toFixed(1)}★` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        {place.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {place.tags.map((t) => (
              <Badge key={t.id} variant="secondary">
                {t.name}
              </Badge>
            ))}
          </div>
        )}
      </Link>
    </div>
  )
}
