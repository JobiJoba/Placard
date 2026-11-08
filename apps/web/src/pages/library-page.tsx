import type {
  BulkAction,
  HouseholdScope,
  OpenWhen,
  PlaceCategory,
  PlaceStatus,
  SearchFilter,
  SearchHit,
} from "@placard/domain"
import { LayoutGrid, Map as MapIcon, Plus, Trash2 } from "lucide-react"
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { CityCenter } from "@/components/library/city-center"
import { Filters } from "@/components/library/filters"
import { PlaceCard } from "@/components/library/place-card"
import { Button } from "@/components/ui/button"
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
  DEFAULT_LIBRARY_BROWSE_PREFS,
  isLibraryScope,
  type LibraryScope,
  type LibraryView,
  readLibraryBrowsePrefs,
  writeLibraryBrowsePrefs,
} from "@/lib/library-browse-prefs"
import { useLibraryDensity } from "@/lib/library-density"
import { useLoad } from "@/lib/use-load"
import { MarketplaceInvitation } from "@/pages/marketplace-page"
import { useMe } from "@/session"

const ResultsMap = lazy(() => import("@/components/library/results-map"))

type Scope = LibraryScope

const parseHouseholdScope = (value: string | null): HouseholdScope => {
  if (value === "mine" || value === "shared" || value === "all") return value
  return "all"
}

const parseOpen = (value: string | null): OpenWhen | undefined =>
  value === "now" || value === "tonight" ? value : undefined

const parseCategory = (value: string | null): PlaceCategory | undefined =>
  value?.trim() && value.length <= 80 ? value : undefined

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
  const scope: Scope = isLibraryScope(scopeParam) ? scopeParam : DEFAULT_LIBRARY_BROWSE_PREFS.scope
  const householdScope = parseHouseholdScope(params.get("household"))
  const sharedBy = params.get("sharedBy") ?? undefined
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
  // useSearchParams' setter identity changes whenever the URL does — guard so we
  // hydrate from device prefs once, not after every Grid / Near me click.
  const didHydrateBrowsePrefs = useRef(false)

  const { data: mapsConfig } = useLoad(useCallback(() => api((c) => c.google.config()), []))
  const { data: tags } = useLoad(useCallback(() => api((c) => c.tags.list()), []))
  const { data: lists } = useLoad(useCallback(() => api((c) => c.lists.list()), []))
  const { data: householdMembers } = useLoad(
    useCallback(() => {
      if (!me.householdEnabled) return Promise.resolve([])
      return api((c) => c.me.householdMembers())
    }, [me.householdEnabled]),
  )

  useEffect(() => {
    setTextDraft(text)
  }, [text])

  // Restore last scope + view when landing on Library without those params.
  // Mount-only hydrate from device prefs; URL stays source of truth afterward.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only prefs hydrate
  useEffect(() => {
    if (didHydrateBrowsePrefs.current) return
    didHydrateBrowsePrefs.current = true
    const prefs = readLibraryBrowsePrefs()
    const next = new URLSearchParams(params)
    let dirty = false
    if (
      !isLibraryScope(params.get("scope")) &&
      prefs.scope !== DEFAULT_LIBRARY_BROWSE_PREFS.scope
    ) {
      next.set("scope", prefs.scope)
      dirty = true
    }
    if (params.get("view") !== "map" && params.get("view") !== "grid" && prefs.view === "map") {
      next.set("view", "map")
      dirty = true
    }
    if (dirty) setParams(next, { replace: true })
    setBrowsePrefsReady(true)
  }, [setParams])

  // Remember only scope + view across visits; filters/search stay ephemeral.
  useEffect(() => {
    if (!browsePrefsReady) return
    writeLibraryBrowsePrefs({ scope, view })
  }, [browsePrefsReady, scope, view])

  useEffect(() => {
    if (textDraft === text) return
    const id = window.setTimeout(() => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (textDraft.trim()) next.set("q", textDraft.trim())
          else next.delete("q")
          return next
        },
        { replace: true },
      )
      setSelected(new Set())
    }, 250)
    return () => window.clearTimeout(id)
  }, [textDraft, text, setParams])

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
      ...(me.householdEnabled && householdScope !== "all" ? { householdScope } : {}),
      ...(me.householdEnabled && sharedBy ? { sharedBy } : {}),
    }
    if (scope === "near" && near) {
      return { ...next, near, radiusKm }
    }
    if (scope === "city" && cityLat != null && cityLng != null && !Number.isNaN(cityLat)) {
      return { ...next, near: { lat: cityLat, lng: cityLng }, radiusKm }
    }
    return next
  }, [
    text,
    tag,
    list,
    status,
    open,
    category,
    scope,
    near,
    radiusKm,
    cityLat,
    cityLng,
    me.householdEnabled,
    householdScope,
    sharedBy,
  ])

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
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
    setSelected(new Set())
  }

  const ownedVisibleIds = useMemo(() => {
    const ids = new Set<string>()
    for (const hit of hits ?? []) {
      if (hit.place.owner.id === me.id) ids.add(hit.place.id)
    }
    return ids
  }, [hits, me.id])

  const toggle = (id: string) => {
    if (!ownedVisibleIds.has(id)) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelected(new Set())

  const exitSelecting = () => {
    clearSelection()
    setSelecting(false)
    setConfirmDelete(false)
  }

  const runBulk = (action: BulkAction) => {
    const placeIds = [...selected].filter((id) => ownedVisibleIds.has(id))
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
    next.set("scope", scope)
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
    if (ownedVisibleIds.size === 0) return
    setSelecting(true)
    setSelected(new Set(ownedVisibleIds))
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
  const canBulkSelect = ownedVisibleIds.size > 0
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

  if (hits && hits.length === 0 && !searchBlocked && !hasSecondaryFilters && scope === "all") {
    return (
      <section className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="font-catalog text-4xl font-semibold tracking-wide uppercase sm:text-5xl">
          Start your crate
        </h1>
        <p className="max-w-md text-muted-foreground">
          Welcome, {me.name}. Import a Takeout export or add places by hand — once the collection is
          here, you can browse it for inspiration.
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
    <section className="library-page flex flex-col gap-6">
      <MarketplaceInvitation />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="page-heading flex flex-col gap-1">
          <p className="section-label">Your personal atlas</p>
          <h1 className="font-catalog text-4xl font-semibold tracking-wide uppercase">Library</h1>
          <p className="text-sm text-muted-foreground">Places to remember. Somewhere to go next.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {showSelectChrome ? (
            <>
              {canBulkSelect ? (
                <Button type="button" size="sm" variant="outline" onClick={selectAllVisible}>
                  Select all
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="ghost" onClick={exitSelecting}>
                Done
              </Button>
            </>
          ) : canBulkSelect ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setSelecting(true)}>
              Select
            </Button>
          ) : null}
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

      <div className="library-toolbar flex flex-col gap-3">
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
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev)
                  next.set("scope", value)
                  // City needs a fresh center — clear any previous lat/lng/name.
                  next.delete("lat")
                  next.delete("lng")
                  next.delete("city")
                  if (value === "all") next.delete("radius")
                  return next
                },
                { replace: true },
              )
              setSelected(new Set())
            }}
            aria-label="Search area"
          >
            <ToggleGroupItem value="near">Near me</ToggleGroupItem>
            <ToggleGroupItem value="city">City</ToggleGroupItem>
            <ToggleGroupItem value="all">All</ToggleGroupItem>
          </ToggleGroup>
          {me.householdEnabled ? (
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              value={householdScope}
              onValueChange={(value) => {
                if (value !== "all" && value !== "mine" && value !== "shared") return
                setParams(
                  (prev) => {
                    const next = new URLSearchParams(prev)
                    if (value === "all") next.delete("household")
                    else next.set("household", value)
                    return next
                  },
                  { replace: true },
                )
                setSelected(new Set())
              }}
              aria-label="Household ownership"
            >
              <ToggleGroupItem value="all">Everyone</ToggleGroupItem>
              <ToggleGroupItem value="mine">Mine</ToggleGroupItem>
              <ToggleGroupItem value="shared">Shared</ToggleGroupItem>
            </ToggleGroup>
          ) : null}
          {me.householdEnabled && (householdMembers?.length ?? 0) > 1 ? (
            <Select
              value={sharedBy ?? "any"}
              onValueChange={(value) => {
                setParams(
                  (prev) => {
                    const next = new URLSearchParams(prev)
                    if (value === "any") next.delete("sharedBy")
                    else next.set("sharedBy", value)
                    return next
                  },
                  { replace: true },
                )
                setSelected(new Set())
              }}
            >
              <SelectTrigger className="w-40" aria-label="Shared by">
                <SelectValue placeholder="Shared by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Anyone</SelectItem>
                {householdMembers?.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
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
            <ResultsMap
              apiKey={mapsConfig.mapsApiKey}
              hits={hits ?? []}
              center={mapCenter}
              distanceUnit={me.distanceUnit}
            />
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
                selecting={showSelectChrome && place.owner.id === me.id}
                selected={selected.has(place.id)}
                onToggle={() => toggle(place.id)}
                viewerId={me.id}
                householdEnabled={me.householdEnabled}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
