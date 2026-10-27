import { appleMapsUrl, googleMapsUrl, organicMapsUrl } from "@placard/domain"
import { DateTime } from "effect"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { useCallback, useState } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, errorMessage, isTagged } from "@/lib/api"
import { categoryIcons, categoryLabels, formatCoordinates, sourceLabels } from "@/lib/places"
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
    error,
    cause,
  } = useLoad(useCallback(() => api((c) => c.places.get({ params: { id } })), [id]))
  const [confirming, setConfirming] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const remove = () =>
    api((c) => c.places.remove({ params: { id } })).then(
      () => navigate("/", { replace: true }),
      (cause: unknown) => setRemoveError(errorMessage(cause)),
    )

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
    <article className="flex flex-col gap-6">
      <BackLink />
      {alreadySaved && (
        <Alert>
          <AlertDescription>This place is already in your library.</AlertDescription>
        </Alert>
      )}
      <header className="flex flex-col gap-2">
        <Badge variant="secondary" className="w-fit gap-1.5">
          <Icon aria-hidden /> {categoryLabels[place.category]}
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight">{place.name}</h1>
        {place.address && <p className="text-muted-foreground">{place.address}</p>}
      </header>

      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Button key={link.label} asChild variant="outline">
            <a href={link.href} target="_blank" rel="noreferrer">
              {link.label} <ExternalLink aria-hidden />
            </a>
          </Button>
        ))}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Coordinates</dt>
        <dd className="tabular-nums">{formatCoordinates(place)}</dd>
        <dt className="text-muted-foreground">Added</dt>
        <dd>
          {DateTime.formatLocal(place.createdAt, { dateStyle: "medium" })} ·{" "}
          {sourceLabels[place.source]}
        </dd>
      </dl>

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

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
      <Link to="/">
        <ArrowLeft /> Library
      </Link>
    </Button>
  )
}
