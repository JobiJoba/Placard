import type { DeletedPlace } from "@placard/domain"
import { DateTime } from "effect"
import { useCallback, useState } from "react"
import { Link } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { api, errorMessage } from "@/lib/api"
import { categoryIcons, categoryLabels } from "@/lib/places"
import { useLoad } from "@/lib/use-load"

export function DeletedPage() {
  const { data, error, reload } = useLoad(useCallback(() => api((c) => c.places.deleted()), []))
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const restore = (placeIds: ReadonlyArray<string>) => {
    setActionError(null)
    api((c) => c.places.restore({ payload: { placeIds } })).then(
      () => {
        setSelected(new Set())
        reload()
      },
      (cause: unknown) => setActionError(errorMessage(cause)),
    )
  }

  if (error) return <ErrorAlert message={error} />
  if (!data) return <Skeleton className="h-40 rounded-xl" />

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Recently deleted</h1>
          <p className="text-sm text-muted-foreground">
            Places stay here for 30 days, then are removed for good.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/">Back to library</Link>
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => restore([...selected])}>
            Restore {selected.size}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}
      <ErrorAlert message={actionError} />

      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing in the trash.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((entry) => (
            <DeletedRow
              key={entry.place.id}
              entry={entry}
              selected={selected.has(entry.place.id)}
              onToggle={() => toggle(entry.place.id)}
              onRestore={() => restore([entry.place.id])}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function DeletedRow({
  entry,
  selected,
  onToggle,
  onRestore,
}: {
  readonly entry: DeletedPlace
  readonly selected: boolean
  readonly onToggle: () => void
  readonly onRestore: () => void
}) {
  const Icon = categoryIcons[entry.place.category]
  return (
    <li className="flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        aria-label={`Select ${entry.place.name}`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="size-3.5" aria-hidden />
          {categoryLabels[entry.place.category]}
        </div>
        <span className="truncate font-medium">{entry.place.name}</span>
        <span className="text-xs text-muted-foreground">
          Deleted {DateTime.formatLocal(entry.deletedAt, { dateStyle: "medium" })} · purge{" "}
          {DateTime.formatLocal(entry.purgeAt, { dateStyle: "medium" })}
        </span>
      </div>
      <Button size="sm" variant="outline" onClick={onRestore}>
        Restore
      </Button>
    </li>
  )
}
