import type { Place } from "@placard/domain"
import { Plus } from "lucide-react"
import { useCallback } from "react"
import { Link } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { categoryIcons, categoryLabels } from "@/lib/places"
import { useLoad } from "@/lib/use-load"
import { useMe } from "@/session"

export function LibraryPage() {
  const me = useMe()
  const { data: places, error } = useLoad(useCallback(() => api((c) => c.places.list()), []))

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

  if (places.length === 0) {
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
        <Button asChild>
          <Link to="/add">
            <Plus /> Add place
          </Link>
        </Button>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {places.map((place) => (
          <li key={place.id}>
            <PlaceCard place={place} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function PlaceCard({ place }: { readonly place: Place }) {
  const Icon = categoryIcons[place.category]
  return (
    <Link
      to={`/places/${place.id}`}
      className="flex h-full flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-shadow hover:ring-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" aria-hidden />
        {categoryLabels[place.category]}
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="font-medium leading-snug">{place.name}</h2>
        {place.address && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{place.address}</p>
        )}
      </div>
    </Link>
  )
}
