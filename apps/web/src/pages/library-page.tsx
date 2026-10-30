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
import {
  isLibraryScope,
  type LibraryScope,
  type LibraryView,
  readLibraryBrowsePrefs,
  writeLibraryBrowsePrefs,
} from "@/lib/library-browse-prefs"
import { useLibraryDensity } from "@/lib/library-density"
import { categoryIcons, categoryLabels, formatDistance, statusLabels } from "@/lib/places"
import { useLoad } from "@/lib/use-load"
import { useMe } from "@/session"

const ResultsMap = lazy(() => import("@/components/library/results-map"))

type Scope = LibraryScope

const parseOpen = (value: string | null): OpenWhen | undefined =>
  value === "now" || value === "tonight" ? value : undefined

const parseCategory = (value: string | null): PlaceCategory | undefined =>
  value && (categories as ReadonlyArray<string>).includes(value)
    ? (value as PlaceCategory)
    : undefined

export function LibraryPage() {
  const me = useMe()
  const [libraryDensity] = useLibraryDensity()
  const [params, setParams] = useSearchParams()
  const text = params.get("q") ?? ""
  const tag = params.get("tag") ?? undefined
  const list = params.get("list") ?? undefined
  const status = (params.get("status") as PlaceStatus | null) ?? undefined
  const open = parseOpen(params.get("open"))
  const category = parseCategory(params.get("category"))
  const scopeParam = params.get("scope")
  const scope: Scope = isLibraryScope(scopeParam) ? scopeParam : "near"
  const radiusKm = Number(params.get("radius") ?? "5") || 5
  const view: LibraryView = params.get("view") === "map" ? "map" : "grid"
  const cityLat = params.get("lat") ? Number(params.get("lat")) : null
  const cityLng = params.get("lng") ? Number(params.get("lng")) : null
  const cityName = params.get("city") ?? null

  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null)
  const [geoSource, setGeoSource] = useState<"browser" | "ip" | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoAttempt, setGeoAttempt] = useState(0)
  const [textDraft, setTextDraft] = useState(text)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newListName, setNewListName] = useState("")
  const [newTagName, setNewTagName] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(() =>
    Boolean(tag || list || status || category || open),
  )
  const [selecting, setSelecting] = useState(false)
  const [browsePrefsReady, setBrowsePrefsReady] = useState(false)

  const { data: mapsConfig } = useLoad(useCallback(() => api((c) => c.google.config()), []))
  const { data: tags } = useLoad(useCallback(() => api((c) => c.tags.list()), []))
  const { data: lists } = useLoad(useCallback(() => api((c) => c.lists.list()), []))

  useEffect(() => {
    setTextDraft(text)
  }, [text])

  // Restore last scope + view when landing on Library without those params.
  useEffect(() => {
    const prefs = readLibraryBrowsePrefs()
    const next = new URLSearchParams(params)
    let dirty = false
    if (!isLibraryScope(params.get("scope")) && prefs.scope !== "near") {
      next.set("scope", prefs.scope)
      dirty = true
    }
    if (params.get("view") !== "map" && params.get("view") !== "grid" && prefs.view === "map") {
      next.set("view", "map")
      dirty = true
    }
    if (dirty) setParams(next, { replace: true })
    setBrowsePrefsReady(true)
    // Mount-only hydrate from device prefs; URL stays source of truth afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setParams])

  // Remember only scope + view across visits; filters/search stay ephemeral.
  useEffect(() => {
    if (!browsePrefsReady) return
    writeLibraryBrowsePrefs({ scope, view })
  }, [browsePrefsReady, scope, view])

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
  const geoBlocked = scope === "near" && Boolean(geoError)
  const waitingForCity =
    scope === "city" && (cityLat == null || cityLng == null || Number.isNaN(cityLat))
  // Near me must never fall through to an unscoped library search when geo fails.
  const searchBlocked = waitingForGeo || waitingForCity || geoBlocked

  const {
    data: hits,
    error,
    reload,
  } = useLoad(
    useCallback(() => {
      if (searchBlocked) return Promise.resolve([] as SearchHit[])
      return api((c) => c.search.query({ payload: filter }))
    }, [filter, searchBlocked]),
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

  const exitSelecting = () => {
    clearSelection()
    setSelecting(false)
    setConfirmDelete(false)
  }

  const runBulk = (action: BulkAction) => {
    const placeIds = [...selected]
    if (placeIds.length === 0) return
    setBulkError(null)
    setBulkBusy(true)
    api((c) => c.places.bulk({ payload: { placeIds, action } })).then(
      () => {
        clearSelection()
        setConfirmDelete(false)
        setBulkBusy(false)
        reload()
      },
      (cause: unknown) => {
        setBulkError(errorMessage(cause))
        setBulkBusy(false)
      },
    )
  }

  const clearFilters = () => {
    const next = new URLSearchParams()
    if (scope !== "near") next.set("scope", scope)
    if (view === "map") next.set("view", "map")
    if (scope === "city") {
      if (cityName) next.set("city", cityName)
      if (cityLat != null && !Number.isNaN(cityLat)) next.set("lat", String(cityLat))
      if (cityLng != null && !Number.isNaN(cityLng)) next.set("lng", String(cityLng))
    }
    if (scope !== "all") next.set("radius", String(radiusKm))
    setParams(next, { replace: true })
    setTextDraft("")
    exitSelecting()
    setFiltersOpen(false)
  }

  const selectAllVisible = () => {
    if (!hits) return
    setSelecting(true)
    setSelected(new Set(hits.map(({ place }) => place.id)))
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

  const hasSecondaryFilters = Boolean(text || tag || list || status || open || category)
  const hasFilters = hasSecondaryFilters || scope !== "all"
  const secondaryFilterCount = [tag, list, status, category, open].filter(Boolean).length
  const filteredEmpty = hits !== null && hits.length === 0 && hasFilters && !searchBlocked
  const mapCenter = filter.near ?? (hits?.[0] ? hits[0].place.location : null)
  const showSelectChrome = selecting || selected.size > 0

  if (error) return <ErrorAlert message={error} />
  if (!hits && !searchBlocked) {
    return (
      <div className="crate-grid" data-density={libraryDensity}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="aspect-square rounded-sm" />
        ))}
      </div>
    )
  }

  if (
    hits &&
    hits.length === 0 &&
    !searchBlocked &&
    !hasSecondaryFilters &&
    scope === "all"
  ) {
    return (
      <section className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="font-catalog text-4xl font-semibold tracking-wide uppercase sm:text-5xl">
          Start your crate
        </h1>
        <p className="max-w-md text-muted-foreground">
          Welcome, {me.name}. Import a Takeout export or add places by hand — once the collection is
          here, you can browse it for inspiration (and modules later).
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Button asChild>
            <Link to="/import">Import places</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/add">
              <Plus /> Add a place
            </Link>
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-catalog text-4xl font-semibold tracking-wide uppercase">Library</h1>
          <p className="text-sm text-muted-foreground">Your places — browse the crate, open one.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {showSelectChrome ? (
            <>
              <Button type="button" size="sm" variant="outline" onClick={selectAllVisible}>
                Select all
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={exitSelecting}>
                Done
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => setSelecting(true)}>
              Select
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link to="/import">Import</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/add">
              <Plus /> Add
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
              if (value !== "near" && value !== "city" && value !== "all") return
              const next = new URLSearchParams(params)
              // Near me is the default (omit param); All must stay explicit.
              if (value === "near") next.delete("scope")
              else next.set("scope", value)
              if (value !== "city") {
                next.delete("lat")
                next.delete("lng")
                next.delete("city")
              } else {
                // Start empty — user picks a city via autocomplete.
                next.delete("lat")
                next.delete("lng")
                next.delete("city")
              }
              if (value === "all") next.delete("radius")
              setParams(next, { replace: true })
              setSelected(new Set())
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
            value={view}
            onValueChange={(value) => {
              setParam("view", value === "map" ? "map" : undefined)
              if (value === "map") clearSelection()
            }}
            aria-label="Result view"
          >
            <ToggleGroupItem value="grid">
              <LayoutGrid aria-hidden /> Grid
            </ToggleGroupItem>
            <ToggleGroupItem value="map">
              <MapIcon aria-hidden /> Map
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            type="button"
            size="sm"
            variant={filtersOpen || secondaryFilterCount > 0 ? "secondary" : "outline"}
            onClick={() => setFiltersOpen((prev) => !prev)}
          >
            Filters{secondaryFilterCount > 0 ? ` (${secondaryFilterCount})` : ""}
          </Button>
        </div>
        {scope === "city" && (
          <CityCenter
            lat={cityLat}
            lng={cityLng}
            cityName={cityName}
            mapsReady={mapsConfig !== null}
            hasMapsKey={Boolean(mapsConfig?.mapsApiKey)}
            onSet={(city) => {
              const next = new URLSearchParams(params)
              next.set("scope", "city")
              next.set("lat", String(city.lat))
              next.set("lng", String(city.lng))
              next.set("city", city.name)
              setParams(next, { replace: true })
              setSelected(new Set())
            }}
            onClear={() => {
              const next = new URLSearchParams(params)
              next.set("scope", "city")
              next.delete("lat")
              next.delete("lng")
              next.delete("city")
              setParams(next, { replace: true })
              setSelected(new Set())
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
          <div className="filter-sheet flex flex-col items-start gap-3 rounded-md px-4 py-4">
            <ErrorAlert message={geoError} />
            <p className="text-sm text-muted-foreground">
              Near me needs a location. Nothing from your full library is shown until we can place
              you — try again, or switch to City / All.
            </p>
            <div className="flex flex-wrap gap-2">
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
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const next = new URLSearchParams(params)
                  next.set("scope", "all")
                  setParams(next, { replace: true })
                }}
              >
                Show all places
              </Button>
            </div>
          </div>
        )}
        {filtersOpen && (
          <div className="filter-sheet flex flex-col gap-2 rounded-md p-3">
            <p className="text-xs text-muted-foreground">
              Cover marks: solid bar = been there · hatch = want to go
            </p>
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
        )}
      </div>

      {view === "grid" && selected.size > 0 && (
        <div className="filter-sheet flex flex-wrap items-center gap-2 rounded-md p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={bulkBusy}>
                Tag
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              {(tags ?? []).map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => runBulk({ _tag: "addTag", tagName: t.name })}
                >
                  {t.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <div className="flex gap-1 p-2">
                <Input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="New tag"
                  className="h-8"
                />
                <Button
                  size="sm"
                  disabled={!newTagName.trim() || bulkBusy}
                  onClick={() => {
                    const name = newTagName.trim()
                    if (!name) return
                    setNewTagName("")
                    runBulk({ _tag: "addTag", tagName: name })
                  }}
                >
                  Add
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={bulkBusy}>
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
                <Button size="sm" disabled={bulkBusy} onClick={createListAndAdd}>
                  Add
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={bulkBusy}>
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
          {confirmDelete ? (
            <>
              <span className="text-sm">Delete {selected.size} places?</span>
              <Button
                size="sm"
                variant="destructive"
                disabled={bulkBusy}
                onClick={() => runBulk({ _tag: "delete" })}
              >
                {bulkBusy ? "Deleting…" : "Confirm"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              disabled={bulkBusy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 aria-hidden /> Delete
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={exitSelecting}>
            Done
          </Button>
        </div>
      )}

      <ErrorAlert message={bulkError} />

      {!searchBlocked && hits && (
        <p className="text-sm text-muted-foreground">
          {hits.length} place{hits.length === 1 ? "" : "s"}
          {scope === "near" && !hasSecondaryFilters
            ? " nearby"
            : scope === "city" && !hasSecondaryFilters
              ? " in this city"
              : hasSecondaryFilters
                ? " match"
                : ""}
        </p>
      )}

      {waitingForGeo ? (
        <div className="crate-grid" data-density={libraryDensity}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="aspect-square rounded-sm" />
          ))}
        </div>
      ) : geoBlocked ? null : waitingForCity ? (
        <p className="text-sm text-muted-foreground">
          Pick a city center above to search within {radiusKm} km.
        </p>
      ) : filteredEmpty && !hasSecondaryFilters && scope === "near" ? (
        <div className="filter-sheet flex flex-col items-start gap-3 rounded-md px-4 py-6">
          <p className="text-sm text-muted-foreground">
            Nothing within {radiusKm} km of you. Widen the radius or browse the whole crate.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const next = new URLSearchParams(params)
                next.set("scope", "all")
                setParams(next, { replace: true })
              }}
            >
              Show all places
            </Button>
            <Button size="sm" asChild variant="outline">
              <Link to="/add">
                <Plus /> Add place
              </Link>
            </Button>
          </div>
        </div>
      ) : filteredEmpty ? (
        <div className="filter-sheet flex flex-col items-start gap-3 rounded-md px-4 py-6">
          <p className="text-sm text-muted-foreground">No places match these filters.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
            <Button size="sm" asChild variant="outline">
              <Link to="/add">
                <Plus /> Add place
              </Link>
            </Button>
          </div>
        </div>
      ) : view === "map" ? (
        mapsConfig?.mapsApiKey ? (
          <Suspense
            fallback={<Skeleton className="h-[min(60vh,520px)] min-h-[280px] rounded-sm" />}
          >
            <ResultsMap apiKey={mapsConfig.mapsApiKey} hits={hits ?? []} center={mapCenter} />
          </Suspense>
        ) : (
          <p className="text-sm text-muted-foreground">
            Add a Google Maps API key in{" "}
            <Link to="/settings/integrations" className="underline underline-offset-2">
              Settings → Integrations
            </Link>{" "}
            to see results on a map.
          </p>
        )
      ) : (
        <ul className="crate-grid list-none p-0" data-density={libraryDensity}>
          {(hits ?? []).map(({ place, distanceMeters }) => (
            <li key={place.id} className="min-w-0">
              <PlaceCard
                place={place}
                distanceMeters={distanceMeters}
                distanceUnit={me.distanceUnit}
                selecting={showSelectChrome}
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

type CityPick = { readonly name: string; readonly lat: number; readonly lng: number }

const RECENT_CITIES_KEY = "placard.recentCities"
const MAX_RECENT_CITIES = 5

const readRecentCities = (): CityPick[] => {
  try {
    const raw = localStorage.getItem(RECENT_CITIES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is CityPick =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as CityPick).name === "string" &&
          typeof (item as CityPick).lat === "number" &&
          typeof (item as CityPick).lng === "number",
      )
      .slice(0, MAX_RECENT_CITIES)
  } catch {
    return []
  }
}

const rememberCity = (city: CityPick) => {
  const next = [city, ...readRecentCities().filter((c) => c.name !== city.name)].slice(
    0,
    MAX_RECENT_CITIES,
  )
  localStorage.setItem(RECENT_CITIES_KEY, JSON.stringify(next))
}

function CityCenter({
  lat,
  lng,
  cityName,
  mapsReady,
  hasMapsKey,
  onSet,
  onClear,
}: {
  readonly lat: number | null
  readonly lng: number | null
  readonly cityName: string | null
  readonly mapsReady: boolean
  readonly hasMapsKey: boolean
  readonly onSet: (city: CityPick) => void
  readonly onClear: () => void
}) {
  const [query, setQuery] = useState("")
  const [sessionToken] = useState(() => crypto.randomUUID())
  const [suggestions, setSuggestions] = useState<
    ReadonlyArray<{ googlePlaceId: string; primaryText: string; secondaryText: string | null }>
  >([])
  const [loading, setLoading] = useState(false)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<CityPick[]>(() =>
    typeof window === "undefined" ? [] : readRecentCities(),
  )
  const selected =
    lat != null && lng != null
      ? { name: cityName ?? `${lat.toFixed(2)}, ${lng.toFixed(2)}`, lat, lng }
      : null

  useEffect(() => {
    if (!hasMapsKey) return
    const input = query.trim()
    if (input.length < 2) {
      setSuggestions([])
      setLoading(false)
      return
    }
    let stale = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      api((c) =>
        c.google.autocomplete({
          payload: {
            input,
            sessionToken,
            near: null,
            includedPrimaryTypes: ["(cities)"],
          },
        }),
      ).then(
        (found) => {
          if (stale) return
          setSuggestions(found)
          setError(null)
          setLoading(false)
        },
        (cause: unknown) => {
          if (stale) return
          setError(errorMessage(cause))
          setLoading(false)
        },
      )
    }, 250)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [query, sessionToken, hasMapsKey])

  const pickSuggestion = (suggestion: {
    googlePlaceId: string
    primaryText: string
    secondaryText: string | null
  }) => {
    setPicking(true)
    setError(null)
    api((c) =>
      c.google.preview({
        params: { googlePlaceId: suggestion.googlePlaceId },
        query: { sessionToken },
      }),
    ).then(
      (preview) => {
        const city: CityPick = {
          name: suggestion.primaryText,
          lat: preview.location.lat,
          lng: preview.location.lng,
        }
        rememberCity(city)
        setRecent(readRecentCities())
        setQuery("")
        setSuggestions([])
        setPicking(false)
        onSet(city)
      },
      (cause: unknown) => {
        setError(errorMessage(cause))
        setPicking(false)
      },
    )
  }

  if (!mapsReady) {
    return <Skeleton className="h-10 w-full max-w-sm rounded-md" />
  }

  if (!hasMapsKey) {
    return (
      <p className="text-sm text-muted-foreground">
        City search needs a Google Maps API key.{" "}
        <Link to="/settings/integrations" className="underline underline-offset-2">
          Add one in Settings → Integrations
        </Link>
        .
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {selected ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Center:</span>
          <Badge variant="secondary">{selected.name}</Badge>
          <Button type="button" size="sm" variant="ghost" onClick={onClear}>
            Change city
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a city…"
            aria-label="Search for a city"
            autoFocus
          />
          {loading && <p className="text-xs text-muted-foreground">Searching…</p>}
          {picking && <p className="text-xs text-muted-foreground">Setting city…</p>}
          <ErrorAlert message={error} />
          {suggestions.length > 0 && (
            <ul className="flex flex-col rounded-xl ring-1 ring-foreground/10">
              {suggestions.map((suggestion) => (
                <li key={suggestion.googlePlaceId} className="border-b last:border-b-0">
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-muted"
                    disabled={picking}
                    onClick={() => pickSuggestion(suggestion)}
                  >
                    <span className="text-sm font-medium">{suggestion.primaryText}</span>
                    {suggestion.secondaryText && (
                      <span className="text-xs text-muted-foreground">
                        {suggestion.secondaryText}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && query.trim().length >= 2 && suggestions.length === 0 && !error && (
            <p className="text-xs text-muted-foreground">No cities match that name.</p>
          )}
          {recent.length > 0 && query.trim().length === 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Recent:</span>
              {recent.map((city) => (
                <Button
                  key={city.name}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    rememberCity(city)
                    setRecent(readRecentCities())
                    onSet(city)
                  }}
                >
                  {city.name}
                </Button>
              ))}
            </div>
          )}
        </div>
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

/** Short place line for covers — city/area, not the full postal wall. */
const coverLocality = (address: string | null): string | null => {
  if (!address) return null
  const parts = address
    .split(",")
    .map((p) =>
      p
        .replace(/\b\d{3}-\d{4}\b/g, "")
        .replace(/\b\d{4,6}\b/g, "")
        .replace(/^[-\s]+|[-\s]+$/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
  if (parts.length === 0) return null
  const line = (parts.length === 1 ? parts[0] : parts.slice(-2).join(", ")) ?? null
  if (!line) return null
  return line.length > 42 ? `${line.slice(0, 40).trimEnd()}…` : line
}

function PlaceCard({
  place,
  distanceMeters,
  distanceUnit,
  selecting,
  selected,
  onToggle,
}: {
  readonly place: Place
  readonly distanceMeters: number | null
  readonly distanceUnit: "km" | "mi"
  readonly selecting: boolean
  readonly selected: boolean
  readonly onToggle: () => void
}) {
  const Icon = categoryIcons[place.category]
  const coverSrc = place.coverThumbUrl
  const locality = coverLocality(place.address)
  return (
    <article
      className={`place-cover relative aspect-square h-full overflow-hidden rounded-sm bg-[var(--crate)] text-[var(--parchment)] ${
        selected ? "outline outline-2 outline-offset-2 outline-[var(--spine-gold)]" : ""
      }`}
    >
      {coverSrc ? (
        <>
          <img
            src={coverSrc}
            alt=""
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: [
                "linear-gradient(to top, var(--crate) 0%, color-mix(in srgb, var(--crate) 55%, transparent) 38%, transparent 62%)",
                "linear-gradient(to bottom, color-mix(in srgb, var(--crate) 78%, transparent) 0%, transparent 42%)",
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
      {selecting ? (
        <div className="cover-check absolute top-2 right-2 z-10">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            aria-label={`Select ${place.name}`}
            className="border-[var(--parchment)] data-[state=checked]:bg-[var(--action)] data-[state=checked]:text-[var(--action-fg)]"
          />
        </div>
      ) : null}
      <Link
        to={`/places/${place.id}`}
        className={`cover-face relative z-[1] flex h-full flex-col justify-between gap-2 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--spine-gold)] ${
          selecting ? "pr-9" : ""
        }`}
      >
        <div className="cover-meta flex items-center gap-1.5 text-xs font-medium tracking-wide text-[var(--parchment)] uppercase [text-shadow:0_1px_2px_rgb(26_22_18_/_70%)]">
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{categoryLabels[place.category]}</span>
          {distanceMeters != null && (
            <span className="ml-auto tabular-nums">
              {formatDistance(distanceMeters, distanceUnit)}
            </span>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-1">
          <h2 className="cover-title font-catalog text-xl font-semibold leading-tight tracking-wide uppercase">
            {place.name}
          </h2>
          {locality ? (
            <p className="cover-address line-clamp-1 text-xs text-[color-mix(in_srgb,var(--parchment)_78%,transparent)]">
              {locality}
            </p>
          ) : null}
          {(place.facts.cuisine || place.facts.rating != null) && (
            <p className="cover-meta text-xs text-[color-mix(in_srgb,var(--spine-gold)_90%,white)]">
              {[
                place.facts.cuisine,
                place.facts.rating != null ? `${place.facts.rating.toFixed(1)}★` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </Link>
    </article>
  )
}
