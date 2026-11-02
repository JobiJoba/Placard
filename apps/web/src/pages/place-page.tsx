import type { PlaceRefreshMode } from "@placard/domain"
import { DateTime } from "effect"
import { ArrowLeft, ChevronDown, ExternalLink, MapPinned, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { EditPlace } from "@/components/place/edit-place"
import { PlaceFactsSection } from "@/components/place/place-facts"
import { PlaceHero } from "@/components/place/place-hero"
import { PlaceRecordSection } from "@/components/place/place-record"
import { PlaceCustomFieldsSection } from "@/components/place-custom-fields"
import { PlaceMediaSection } from "@/components/place-media"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { api, errorMessage, isTagged } from "@/lib/api"
import {
  mapsProviderLabels,
  mapsProviderOpenLabels,
  mapsUrlFor,
  orderedMapsProviders,
  useMapsProvider,
} from "@/lib/maps-provider"
import { categoryIcons, formatCoordinates, sourceLabels } from "@/lib/places"
import { useLoad } from "@/lib/use-load"
import { useMe } from "@/session"

/** Set as router state when an add flow lands on a place the user already had. */
export interface PlacePageState {
  readonly alreadySaved?: boolean
}

type ShareConflict = {
  readonly existingPlaceId: string
  readonly existingName: string
  readonly ownerName: string
}

export function PlacePage() {
  const me = useMe()
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
  const [shareBusy, setShareBusy] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [shareConflict, setShareConflict] = useState<ShareConflict | null>(null)
  const [mapsProvider] = useMapsProvider()
  const isOwner = place ? place.owner.id === me.id : false

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

  const setVisibility = (visibility: "private" | "household") => {
    setShareBusy(true)
    setShareError(null)
    setShareConflict(null)
    void api((c) => c.places.setVisibility({ params: { id }, payload: { visibility } })).then(
      (next) => {
        setData(next)
        setShareBusy(false)
      },
      (cause: unknown) => {
        setShareBusy(false)
        if (isTagged(cause, "HouseholdPlaceConflict")) {
          const conflict = cause as {
            existingPlaceId: string
            existingName: string
            owner: { name: string }
          }
          setShareConflict({
            existingPlaceId: conflict.existingPlaceId,
            existingName: conflict.existingName,
            ownerName: conflict.owner.name,
          })
          return
        }
        setShareError(errorMessage(cause))
      },
    )
  }

  const resolveConflict = async (copyFields: boolean) => {
    if (!shareConflict) return
    setShareBusy(true)
    setShareError(null)
    try {
      if (copyFields) {
        await api((c) =>
          c.places.copyInto({
            params: { id, targetId: shareConflict.existingPlaceId },
            payload: { notes: true, status: true, customFields: true },
          }),
        )
      }
      setShareConflict(null)
      navigate(`/places/${shareConflict.existingPlaceId}`, { replace: true })
    } catch (cause) {
      setShareError(errorMessage(cause))
    } finally {
      setShareBusy(false)
    }
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
      <div
        className="flex flex-col gap-4 pb-8"
        role="status"
        aria-busy="true"
        aria-label="Loading place"
      >
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

      {me.householdEnabled && !isOwner && place.visibility === "household" ? (
        <Alert>
          <AlertDescription>
            Shared by {place.owner.name}. You can view and add photos.
          </AlertDescription>
        </Alert>
      ) : null}
      {me.householdEnabled && isOwner && place.visibility === "household" ? (
        <Alert>
          <AlertDescription>Shared with the household.</AlertDescription>
        </Alert>
      ) : null}
      <ErrorAlert message={shareError} />
      {shareConflict ? (
        <Alert>
          <AlertDescription className="flex flex-col gap-3">
            <span>
              {shareConflict.ownerName} already shared {shareConflict.existingName} with the
              household. There is no automatic merge.
            </span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={shareBusy} onClick={() => void resolveConflict(false)}>
                Use household place
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={shareBusy}
                onClick={() => void resolveConflict(true)}
              >
                Copy empty fields, then open
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={shareBusy}
                onClick={() => setShareConflict(null)}
              >
                Keep mine private
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

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
              {isOwner && place.googlePlaceId ? (
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
        {me.householdEnabled && isOwner ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 sm:min-h-8"
            disabled={shareBusy}
            onClick={() =>
              setVisibility(place.visibility === "household" ? "private" : "household")
            }
          >
            {place.visibility === "household" ? "Unshare" : "Share with household"}
          </Button>
        ) : null}
        {isOwner ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 sm:min-h-8"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
          >
            {editing ? "Close edit" : "Edit"}
          </Button>
        ) : null}
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

      {editing && isOwner ? (
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
        readOnly={!isOwner}
        onChanged={(next) => {
          setData(next)
        }}
      />

      <PlaceFactsSection place={place} />

      <PlaceMediaSection placeId={place.id} viewerId={me.id} isPlaceOwner={isOwner} />

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
          {me.householdEnabled ? (
            <>
              <dt className="text-muted-foreground">Owner</dt>
              <dd>{place.owner.name}</dd>
              <dt className="text-muted-foreground">Visibility</dt>
              <dd>{place.visibility === "household" ? "Household" : "Private"}</dd>
            </>
          ) : null}
        </dl>
      </details>

      {isOwner ? (
        <div className="flex flex-col items-start gap-3 border-t pt-6 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <ErrorAlert message={removeError} />
          {confirming ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                Remove {place.name}? It moves to Recently deleted for 30 days, then is purged with
                its photos.
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
      ) : null}
    </article>
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
