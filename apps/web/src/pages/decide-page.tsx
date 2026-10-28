import {
  appleMapsUrl,
  type DecideRequest,
  googleMapsUrl,
  organicMapsUrl,
  type Place,
  type PlaceList,
  type TagSummary,
} from "@placard/domain"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api, errorMessage, isTagged } from "@/lib/api"
import { requestLocation } from "@/lib/geolocation"
import { useLoad } from "@/lib/use-load"

const radiusOptions = [1, 2, 5, 10, 25] as const
const SPIN_MS = 1400
const SPIN_NAMES = ["Da Michele", "L'Asador", "Café Sperl", "Ramen Spot", "The Corner"] as const

type PoolSource = "all" | "list" | "tag"

export function DecidePage() {
  const { data: lists } = useLoad(useCallback(() => api((c) => c.lists.list()), []))
  const { data: tags } = useLoad(useCallback(() => api((c) => c.tags.list()), []))

  const [poolSource, setPoolSource] = useState<PoolSource>("all")
  const [listId, setListId] = useState<string>("")
  const [tagName, setTagName] = useState<string>("")
  const [openTonight, setOpenTonight] = useState(true)
  const [nearMe, setNearMe] = useState(false)
  const [radiusKm, setRadiusKm] = useState(5)
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [avoidRecent, setAvoidRecent] = useState(true)

  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [spinLabel, setSpinLabel] = useState("")
  const [result, setResult] = useState<Place | null>(null)
  const [spinError, setSpinError] = useState<string | null>(null)

  useEffect(() => {
    if (!nearMe) {
      setNear(null)
      setGeoError(null)
      return
    }
    let cancelled = false
    setGeoLoading(true)
    setGeoError(null)
    void requestLocation().then((geo) => {
      if (cancelled) return
      setGeoLoading(false)
      if (geo.ok) {
        setNear({ lat: geo.lat, lng: geo.lng })
        setGeoError(null)
      } else {
        setNear(null)
        setGeoError(geo.message)
      }
    })
    return () => {
      cancelled = true
    }
  }, [nearMe])

  const request: DecideRequest | null = useMemo(() => {
    if (poolSource === "list" && !listId) return null
    if (poolSource === "tag" && !tagName) return null
    if (nearMe && !near) return null

    return {
      avoidRecent,
      open: openTonight ? "tonight" : undefined,
      list: poolSource === "list" ? listId : undefined,
      tag: poolSource === "tag" ? tagName : undefined,
      ...(nearMe && near ? { near, radiusKm } : {}),
    }
  }, [avoidRecent, listId, near, nearMe, openTonight, poolSource, radiusKm, tagName])

  useEffect(() => {
    if (!request) {
      setPreviewCount(null)
      setPreviewError(null)
      return
    }
    let cancelled = false
    setPreviewError(null)
    void api((c) => c.decide.preview({ payload: request })).then(
      (preview) => {
        if (!cancelled) setPreviewCount(preview.count)
      },
      (cause: unknown) => {
        if (!cancelled) {
          setPreviewCount(null)
          setPreviewError(errorMessage(cause))
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [request])

  const choose = () => {
    if (!request || spinning) return
    setSpinError(null)
    setResult(null)
    setSpinning(true)

    let tick = 0
    const timer = window.setInterval(() => {
      setSpinLabel(SPIN_NAMES[tick % SPIN_NAMES.length] ?? "")
      tick += 1
    }, 90)

    const started = Date.now()
    void api((c) => c.decide.spin({ payload: request }))
      .then(async (outcome) => {
        const wait = Math.max(0, SPIN_MS - (Date.now() - started))
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
        window.clearInterval(timer)
        setSpinLabel(outcome.place.name)
        setResult(outcome.place)
        setPreviewCount((n) => (n == null ? n : Math.max(0, n - (avoidRecent ? 1 : 0))))
        setSpinning(false)
      })
      .catch((cause: unknown) => {
        window.clearInterval(timer)
        setSpinning(false)
        setSpinLabel("")
        setSpinError(isTagged(cause, "DecidePoolEmpty") ? errorMessage(cause) : errorMessage(cause))
      })
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <header className="flex flex-col gap-2 text-center">
        <p className="font-catalog text-sm tracking-[0.2em] text-[color-mix(in_srgb,var(--crate)_55%,transparent)] uppercase">
          Tonight
        </p>
        <h1 className="font-catalog text-4xl font-semibold tracking-wide text-[var(--crate)] uppercase">
          Decide
        </h1>
        <p className="text-sm text-muted-foreground">
          One restaurant from your library. Open tonight, near you, or just surprise me.
        </p>
      </header>

      <section
        className="flex flex-col gap-5 rounded-md border border-[var(--crate-edge)] bg-[var(--crate)] p-5 text-[var(--parchment)] shadow-[0_18px_40px_-28px_rgb(26_22_18_/_70%)]"
        aria-label="Decide controls"
      >
        <Field>
          <FieldLabel className="text-[color-mix(in_srgb,var(--parchment)_78%,transparent)]">
            Pool
          </FieldLabel>
          <Select value={poolSource} onValueChange={(value) => setPoolSource(value as PoolSource)}>
            <SelectTrigger className="w-full border-[var(--crate-edge)] bg-[var(--crate-raised)] text-[var(--parchment)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All restaurants</SelectItem>
              <SelectItem value="list">A list</SelectItem>
              <SelectItem value="tag">A tag</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {poolSource === "list" && (
          <PoolSelect
            label="List"
            value={listId || undefined}
            placeholder={lists ? "Choose a list" : "Loading…"}
            onChange={setListId}
            options={(lists ?? []).map((list: PlaceList) => ({
              value: list.id,
              label: list.name,
            }))}
          />
        )}

        {poolSource === "tag" && (
          <PoolSelect
            label="Tag"
            value={tagName || undefined}
            placeholder={tags ? "Choose a tag" : "Loading…"}
            onChange={setTagName}
            options={(tags ?? []).map((tag: TagSummary) => ({
              value: tag.name,
              label: tag.name,
            }))}
          />
        )}

        <div className="flex items-center gap-3 text-sm">
          <Checkbox
            checked={openTonight}
            onCheckedChange={(v) => setOpenTonight(v === true)}
            aria-label="Open tonight"
            className="border-[var(--parchment)] data-[state=checked]:bg-[var(--spine-gold)] data-[state=checked]:text-[var(--crate)]"
          />
          <span aria-hidden>Open tonight</span>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <Checkbox
            checked={nearMe}
            onCheckedChange={(v) => setNearMe(v === true)}
            aria-label="Near me"
            className="border-[var(--parchment)] data-[state=checked]:bg-[var(--spine-gold)] data-[state=checked]:text-[var(--crate)]"
          />
          <span aria-hidden>Near me</span>
        </div>

        {nearMe && (
          <Field>
            <FieldLabel className="text-[color-mix(in_srgb,var(--parchment)_78%,transparent)]">
              Radius
            </FieldLabel>
            <Select value={String(radiusKm)} onValueChange={(v) => setRadiusKm(Number(v))}>
              <SelectTrigger className="w-full border-[var(--crate-edge)] bg-[var(--crate-raised)] text-[var(--parchment)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {radiusOptions.map((km) => (
                  <SelectItem key={km} value={String(km)}>
                    {km} km
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {geoLoading && <p className="mt-1 text-xs opacity-70">Getting your location…</p>}
            {geoError && (
              <p className="mt-1 text-xs text-[color-mix(in_srgb,#f87171_80%,white)]">{geoError}</p>
            )}
          </Field>
        )}

        <div className="flex items-center gap-3 text-sm">
          <Checkbox
            checked={avoidRecent}
            onCheckedChange={(v) => setAvoidRecent(v === true)}
            aria-label="Avoid recent picks for 14 days"
            className="border-[var(--parchment)] data-[state=checked]:bg-[var(--spine-gold)] data-[state=checked]:text-[var(--crate)]"
          />
          <span aria-hidden>Avoid recent picks (14 days)</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--crate-edge)] pt-4">
          <p className="text-sm text-[color-mix(in_srgb,var(--parchment)_72%,transparent)]">
            {previewError
              ? "Couldn't count the pool"
              : previewCount == null
                ? nearMe && !near
                  ? "Waiting for location…"
                  : "…"
                : previewCount === 0
                  ? "Nothing in the pool"
                  : `${previewCount} in the pool`}
          </p>
          <Button
            type="button"
            size="lg"
            disabled={!request || spinning || previewCount === 0}
            className="bg-[var(--action)] text-[var(--action-fg)] hover:bg-[color-mix(in_srgb,var(--action)_88%,black)]"
            onClick={choose}
          >
            {spinning ? "Choosing…" : "Choose for me"}
          </Button>
        </div>
      </section>

      {(previewError || spinError) && <ErrorAlert message={previewError ?? spinError} />}

      <div
        className="relative min-h-48 overflow-hidden rounded-md border border-[var(--crate-edge)] bg-[var(--crate-raised)] text-[var(--parchment)]"
        aria-live="polite"
      >
        {spinning ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 px-4">
            <p className="font-catalog animate-pulse text-3xl font-semibold tracking-wide uppercase">
              {spinLabel || "…"}
            </p>
            <p className="text-xs tracking-[0.18em] text-[var(--spine-gold)] uppercase">Spinning</p>
          </div>
        ) : result ? (
          <ResultCard
            place={result}
            onAgain={choose}
            canAgain={Boolean(request) && (previewCount ?? 1) > 0}
          />
        ) : previewCount === 0 && request ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="font-catalog text-xl tracking-wide uppercase">Nothing open</p>
            <p className="text-sm text-[color-mix(in_srgb,var(--parchment)_70%,transparent)]">
              Relax open tonight, widen the radius, or turn off avoid recent.
            </p>
          </div>
        ) : (
          <div className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="font-catalog text-xl tracking-wide text-[var(--spine-gold)] uppercase">
              Ready when you are
            </p>
            <p className="text-sm text-[color-mix(in_srgb,var(--parchment)_70%,transparent)]">
              Set the pool, then hit choose.
            </p>
          </div>
        )}
      </div>

      {lists === null && tags === null && <Skeleton className="h-10 rounded-md" />}
    </div>
  )
}

function PoolSelect({
  label,
  value,
  placeholder,
  onChange,
  options,
}: {
  readonly label: string
  readonly value: string | undefined
  readonly placeholder: string
  readonly onChange: (value: string) => void
  readonly options: ReadonlyArray<{ value: string; label: string }>
}) {
  return (
    <Field>
      <FieldLabel className="text-[color-mix(in_srgb,var(--parchment)_78%,transparent)]">
        {label}
      </FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full border-[var(--crate-edge)] bg-[var(--crate-raised)] text-[var(--parchment)]">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

function ResultCard({
  place,
  onAgain,
  canAgain,
}: {
  readonly place: Place
  readonly onAgain: () => void
  readonly canAgain: boolean
}) {
  const cover = place.coverThumbUrl
  return (
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-stretch">
      <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-sm bg-[var(--crate)] sm:w-36">
        {cover ? (
          <img src={cover} alt="" className="size-full object-cover" />
        ) : (
          <div
            className="size-full"
            style={{
              background:
                "linear-gradient(160deg, #8b3a2a 0%, color-mix(in srgb, var(--crate) 55%, #8b3a2a) 55%, var(--crate) 100%)",
            }}
            aria-hidden
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.16em] text-[var(--spine-gold)] uppercase">Tonight</p>
          <h2 className="font-catalog text-2xl font-semibold tracking-wide uppercase">
            {place.name}
          </h2>
          {place.address && (
            <p className="mt-1 text-sm text-[color-mix(in_srgb,var(--parchment)_72%,transparent)]">
              {place.address}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="bg-[var(--action)] text-[var(--action-fg)]">
            <Link to={`/places/${place.id}`}>Open place</Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-[var(--crate-edge)] bg-transparent text-[var(--parchment)]"
          >
            <a href={googleMapsUrl(place)} target="_blank" rel="noreferrer">
              Maps
            </a>
          </Button>
          <Button asChild size="sm" variant="ghost" className="text-[var(--parchment)]">
            <a href={appleMapsUrl(place)} target="_blank" rel="noreferrer">
              Apple
            </a>
          </Button>
          <Button asChild size="sm" variant="ghost" className="text-[var(--parchment)]">
            <a href={organicMapsUrl(place)} target="_blank" rel="noreferrer">
              Organic
            </a>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!canAgain}
            onClick={onAgain}
          >
            Spin again
          </Button>
        </div>
      </div>
    </div>
  )
}
