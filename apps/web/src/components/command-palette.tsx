import {
  type DistanceUnit,
  type MyModule,
  type PlaceList,
  placeCategories,
  type SearchHit,
  type TagSummary,
} from "@placard/domain"
import {
  Download,
  Filter,
  LayoutGrid,
  LogOut,
  MapPin,
  Plus,
  Ruler,
  Search,
  Settings,
} from "lucide-react"
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { api } from "@/lib/api"
import { LIBRARY_DENSITIES, type LibraryDensity, useLibraryDensity } from "@/lib/library-density"
import { categoryLabels, statusLabels } from "@/lib/places"
import { useMe, useSession } from "@/session"

type PaletteCommand = {
  readonly id: string
  readonly label: string
  readonly keywords?: string
  readonly icon?: ReactNode
  readonly run: () => void | Promise<void>
}

async function downloadLibraryExport(): Promise<void> {
  const response = await fetch("/api/export", { credentials: "include" })
  if (!response.ok) return
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = "placard-export.zip"
  anchor.click()
  URL.revokeObjectURL(url)
}

export function CommandPalette({
  modules,
  open,
  onOpenChange,
}: {
  readonly modules: ReadonlyArray<MyModule>
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const me = useMe()
  const { setMe, signOut } = useSession()
  const [density, setDensity] = useLibraryDensity()
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<ReadonlyArray<SearchHit>>([])
  const [tags, setTags] = useState<ReadonlyArray<TagSummary>>([])
  const [lists, setLists] = useState<ReadonlyArray<PlaceList>>([])

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const go = useCallback(
    (to: string) => {
      close()
      navigate(to)
    },
    [close, navigate],
  )

  const run = useCallback(
    (action: () => void | Promise<void>) => {
      close()
      void action()
    },
    [close],
  )

  useEffect(() => {
    if (!open) {
      setQuery("")
      setHits([])
      return
    }
    void api((c) => c.tags.list()).then(setTags, () => setTags([]))
    void api((c) => c.lists.list()).then(setLists, () => setLists([]))
  }, [open])

  useEffect(() => {
    if (!open) return
    const text = query.trim()
    if (text.length < 2) {
      setHits([])
      return
    }
    const id = window.setTimeout(() => {
      void api((c) => c.search.query({ payload: { text } })).then(
        (result) => setHits(result.slice(0, 8)),
        () => setHits([]),
      )
    }, 200)
    return () => window.clearTimeout(id)
  }, [open, query])

  const setDistanceUnit = useCallback(
    async (distanceUnit: DistanceUnit) => {
      setMe(await api((c) => c.me.updateSettings({ payload: { distanceUnit } })))
    },
    [setMe],
  )

  const pluginNav = useMemo(
    () =>
      modules.flatMap((m) =>
        m.visible
          ? m.nav.map((item) => ({
              id: `module:${m.id}:${item.path}`,
              to: item.path,
              label: item.label,
              moduleName: m.name,
            }))
          : [],
      ),
    [modules],
  )

  const goTo = useMemo((): ReadonlyArray<PaletteCommand> => {
    const items: PaletteCommand[] = [
      {
        id: "go:library",
        label: "Go to Library",
        keywords: "home places crate",
        icon: <LayoutGrid />,
        run: () => go("/"),
      },
      {
        id: "go:add",
        label: "Go to Add place",
        keywords: "create new place",
        icon: <Plus />,
        run: () => go("/add"),
      },
      {
        id: "go:import",
        label: "Go to Import",
        keywords: "takeout google upload",
        run: () => go("/import"),
      },
      {
        id: "go:lists",
        label: "Go to Lists",
        keywords: "collections",
        run: () => go("/lists"),
      },
      {
        id: "go:deleted",
        label: "Go to Recently deleted",
        keywords: "trash restore",
        run: () => go("/deleted"),
      },
      {
        id: "go:settings",
        label: "Go to Settings",
        keywords: "preferences account",
        icon: <Settings />,
        run: () => go("/settings/general"),
      },
    ]
    for (const item of pluginNav) {
      items.push({
        id: item.id,
        label: `Go to ${item.label}`,
        keywords: `${item.moduleName} module plugin`,
        run: () => go(item.to),
      })
    }
    return items
  }, [go, pluginNav])

  const actions = useMemo((): ReadonlyArray<PaletteCommand> => {
    return [
      {
        id: "act:add",
        label: "Add place",
        keywords: "create new",
        icon: <Plus />,
        run: () => go("/add"),
      },
      {
        id: "act:import",
        label: "Import Takeout",
        keywords: "google upload zip",
        run: () => go("/import"),
      },
      {
        id: "act:list",
        label: "Create list",
        keywords: "new collection",
        run: () => go("/lists"),
      },
      {
        id: "act:export",
        label: "Export library",
        keywords: "download zip backup",
        icon: <Download />,
        run: () => void downloadLibraryExport(),
      },
      {
        id: "act:signout",
        label: "Sign out",
        keywords: "logout exit",
        icon: <LogOut />,
        run: () => void signOut(),
      },
    ]
  }, [go, signOut])

  const preferences = useMemo((): ReadonlyArray<PaletteCommand> => {
    const densityItems: PaletteCommand[] = LIBRARY_DENSITIES.map((n) => ({
      id: `pref:density:${n}`,
      label: `Library grid · ${n}${density === n ? " (current)" : ""}`,
      keywords: `grid density columns ${n} layout cards per row`,
      icon: <LayoutGrid />,
      run: () => setDensity(n as LibraryDensity),
    }))
    const otherUnit: DistanceUnit = me.distanceUnit === "km" ? "mi" : "km"
    return [
      ...densityItems,
      {
        id: "pref:unit:km",
        label: `Distance · Kilometers${me.distanceUnit === "km" ? " (current)" : ""}`,
        keywords: "km kilometres metric distance unit",
        icon: <Ruler />,
        run: () => void setDistanceUnit("km"),
      },
      {
        id: "pref:unit:mi",
        label: `Distance · Miles${me.distanceUnit === "mi" ? " (current)" : ""}`,
        keywords: "mi imperial distance unit",
        icon: <Ruler />,
        run: () => void setDistanceUnit("mi"),
      },
      {
        id: "pref:unit:toggle",
        label: `Toggle distance · ${me.distanceUnit} → ${otherUnit}`,
        keywords: "km miles swap flip distance unit",
        icon: <Ruler />,
        run: () => void setDistanceUnit(otherUnit),
      },
    ]
  }, [density, me.distanceUnit, setDensity, setDistanceUnit])

  const filters = useMemo((): ReadonlyArray<PaletteCommand> => {
    const items: PaletteCommand[] = [
      {
        id: "filter:clear",
        label: "Clear library filters",
        keywords: "reset all",
        icon: <Filter />,
        run: () => go("/"),
      },
      {
        id: "filter:map",
        label: "Library map view",
        keywords: "view map",
        run: () => go("/?view=map"),
      },
      {
        id: "filter:near",
        label: "Scope · Near me",
        keywords: "nearby geo location",
        run: () => go("/?scope=near"),
      },
      {
        id: "filter:city",
        label: "Scope · City",
        keywords: "city center",
        run: () => go("/?scope=city"),
      },
      {
        id: "filter:all",
        label: "Scope · All places",
        keywords: "everywhere",
        run: () => go("/?scope=all"),
      },
      {
        id: "filter:status:want",
        label: `Filter · ${statusLabels.want_to_go}`,
        keywords: "want wishlist status",
        run: () => go("/?status=want_to_go"),
      },
      {
        id: "filter:status:been",
        label: `Filter · ${statusLabels.been_there}`,
        keywords: "visited been status",
        run: () => go("/?status=been_there"),
      },
      {
        id: "filter:open:now",
        label: "Filter · Open now",
        keywords: "hours open",
        run: () => go("/?open=now"),
      },
      {
        id: "filter:open:tonight",
        label: "Filter · Open tonight",
        keywords: "hours evening",
        run: () => go("/?open=tonight"),
      },
    ]
    for (const category of placeCategories) {
      items.push({
        id: `filter:cat:${category}`,
        label: `Filter · ${categoryLabels[category]}`,
        keywords: `category ${category}`,
        run: () => go(`/?category=${category}`),
      })
    }
    for (const tag of tags) {
      items.push({
        id: `filter:tag:${tag.name}`,
        label: `Tag · ${tag.name}`,
        keywords: `tag filter ${tag.name}`,
        run: () => go(`/?tag=${encodeURIComponent(tag.name)}`),
      })
    }
    for (const list of lists) {
      items.push({
        id: `filter:list:${list.id}`,
        label: `List · ${list.name}`,
        keywords: `list filter ${list.name}`,
        run: () => go(`/?list=${encodeURIComponent(list.id)}`),
      })
    }
    return items
  }, [go, lists, tags])

  const settings = useMemo((): ReadonlyArray<PaletteCommand> => {
    const items: PaletteCommand[] = [
      {
        id: "settings:general",
        label: "Settings · General",
        keywords: "account password density units export",
        icon: <Settings />,
        run: () => go("/settings/general"),
      },
      {
        id: "settings:mcp",
        label: "Settings · MCP",
        keywords: "tokens connect assistant",
        icon: <Settings />,
        run: () => go("/settings/mcp"),
      },
    ]
    if (me.role === "admin") {
      items.push(
        {
          id: "settings:marketplace",
          label: "Settings · Marketplace",
          keywords: "modules plugins admin install",
          run: () => go("/settings/marketplace"),
        },
        {
          id: "settings:integrations",
          label: "Settings · Integrations",
          keywords: "google api key enrichment admin",
          run: () => go("/settings/integrations"),
        },
        {
          id: "settings:people",
          label: "Settings · People",
          keywords: "invites users admin",
          run: () => go("/settings/people"),
        },
      )
      for (const mod of modules) {
        items.push({
          id: `settings:module:${mod.id}`,
          label: `Module settings · ${mod.name}`,
          keywords: `admin module ${mod.id}`,
          run: () => go(`/settings/modules/${encodeURIComponent(mod.id)}`),
        })
      }
    }
    return items
  }, [go, me.role, modules])

  const trimmed = query.trim()
  const browsing = trimmed.length === 0

  const renderCommands = (items: ReadonlyArray<PaletteCommand>) =>
    items.map((item) => (
      <CommandItem
        key={item.id}
        value={`${item.label} ${item.keywords ?? ""}`}
        onSelect={() => run(item.run)}
      >
        {item.icon}
        {item.label}
      </CommandItem>
    ))

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search Placard"
      description="Search places and run actions"
      className="border border-[var(--crate-edge)] bg-[var(--parchment)] text-[var(--parchment-ink)] shadow-[0_24px_60px_-28px_rgb(26_22_18_/_55%)] sm:max-w-lg"
      showCloseButton={false}
    >
      <Command className="rounded-xl" loop>
        <CommandInput
          placeholder="Search places and commands…"
          value={query}
          onValueChange={setQuery}
          className="text-[var(--parchment-ink)] placeholder:text-muted-foreground"
        />
        <CommandList className="max-h-[min(60vh,22rem)]">
          <CommandEmpty>No matches.</CommandEmpty>

          {!browsing && hits.length > 0 ? (
            <CommandGroup heading="Places">
              {hits.map(({ place }) => (
                <CommandItem
                  key={place.id}
                  value={`place ${place.name} ${place.address ?? ""} ${place.category}`}
                  onSelect={() => go(`/places/${place.id}`)}
                >
                  <MapPin />
                  <span className="min-w-0 flex-1 truncate">{place.name}</span>
                  {place.address ? (
                    <span className="max-w-[40%] truncate text-xs text-muted-foreground">
                      {place.address}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {!browsing ? (
            <CommandGroup heading="Search">
              <CommandItem
                value={`search library for ${trimmed}`}
                onSelect={() => go(`/?q=${encodeURIComponent(trimmed)}`)}
              >
                <Search />
                Search library for “{trimmed}”
              </CommandItem>
            </CommandGroup>
          ) : null}

          <CommandGroup heading="Actions">{renderCommands(actions)}</CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Preferences">{renderCommands(preferences)}</CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Go to">{renderCommands(goTo)}</CommandGroup>

          {!browsing ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Library filters">{renderCommands(filters)}</CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Settings">{renderCommands(settings)}</CommandGroup>
            </>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
