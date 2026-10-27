import type { BulkAction, Place, PlaceList, PlaceStatus, TagSummary } from "@placard/domain"
import { Plus, Trash2 } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
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
import { api, errorMessage } from "@/lib/api"
import { categoryIcons, categoryLabels, statusLabels } from "@/lib/places"
import { useLoad } from "@/lib/use-load"
import { useMe } from "@/session"

export function LibraryPage() {
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const tag = params.get("tag") ?? undefined
  const list = params.get("list") ?? undefined
  const status = (params.get("status") as PlaceStatus | null) ?? undefined
  const {
    data: places,
    error,
    reload,
  } = useLoad(
    useCallback(
      () => api((c) => c.places.list({ query: { tag, list, status } })),
      [tag, list, status],
    ),
  )
  const { data: tags } = useLoad(useCallback(() => api((c) => c.tags.list()), []))
  const { data: lists } = useLoad(useCallback(() => api((c) => c.lists.list()), []))

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [newListName, setNewListName] = useState("")

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

  const setFilter = (key: "tag" | "list" | "status", value: string | undefined) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
    clearSelection()
  }

  const filteredEmpty = places !== null && places.length === 0 && Boolean(tag || list || status)

  if (error) return <ErrorAlert message={error} />
  if (!places) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    )
  }

  if (places.length === 0 && !filteredEmpty) {
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

      <Filters
        tags={tags ?? []}
        lists={lists ?? []}
        tag={tag}
        list={list}
        status={status}
        onTag={(value) => setFilter("tag", value)}
        onList={(value) => setFilter("list", value)}
        onStatus={(value) => setFilter("status", value)}
      />

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

      {filteredEmpty ? (
        <p className="text-sm text-muted-foreground">No places match these filters.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {places.map((place) => (
            <li key={place.id}>
              <PlaceCard
                place={place}
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

function Filters({
  tags,
  lists,
  tag,
  list,
  status,
  onTag,
  onList,
  onStatus,
}: {
  readonly tags: ReadonlyArray<TagSummary>
  readonly lists: ReadonlyArray<PlaceList>
  readonly tag?: string | undefined
  readonly list?: string | undefined
  readonly status?: PlaceStatus | undefined
  readonly onTag: (value: string | undefined) => void
  readonly onList: (value: string | undefined) => void
  readonly onStatus: (value: PlaceStatus | undefined) => void
}) {
  const listOptions = useMemo(() => lists, [lists])
  return (
    <div className="flex flex-wrap gap-2">
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
  selected,
  onToggle,
}: {
  readonly place: Place
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
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="font-medium leading-snug">{place.name}</h2>
          {place.address && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{place.address}</p>
          )}
          {(place.facts.cuisine || place.facts.rating != null) && (
            <p className="text-xs text-muted-foreground">
              {[place.facts.cuisine, place.facts.rating != null ? `${place.facts.rating.toFixed(1)}★` : null]
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
