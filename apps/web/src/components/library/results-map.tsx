import type { Place, PlaceCategory, SearchHit } from "@placard/domain"
import {
  AdvancedMarker,
  APIProvider,
  Map as GoogleMap,
  InfoWindow,
  useAdvancedMarkerRef,
  useMap,
} from "@vis.gl/react-google-maps"
import { useEffect, useState } from "react"
import { Link } from "react-router"
import { categoryIcons, categoryLabels, formatDistance, statusLabels } from "@/lib/places"

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

/** Short place line — city/area, not the full postal wall. */
const pinLocality = (address: string | null): string | null => {
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

function FitResults({
  hits,
  center,
}: {
  readonly hits: ReadonlyArray<SearchHit>
  readonly center: { readonly lat: number; readonly lng: number } | null
}) {
  const map = useMap()
  useEffect(() => {
    if (!map) return
    if (hits.length === 0) {
      if (center) {
        map.setCenter(center)
        map.setZoom(12)
      }
      return
    }
    if (hits.length === 1) {
      map.setCenter(hits[0]?.place.location)
      map.setZoom(14)
      return
    }
    let minLat = Infinity
    let maxLat = -Infinity
    let minLng = Infinity
    let maxLng = -Infinity
    for (const { place } of hits) {
      minLat = Math.min(minLat, place.location.lat)
      maxLat = Math.max(maxLat, place.location.lat)
      minLng = Math.min(minLng, place.location.lng)
      maxLng = Math.max(maxLng, place.location.lng)
    }
    map.fitBounds({ south: minLat, west: minLng, north: maxLat, east: maxLng }, 48)
  }, [map, hits, center])
  return null
}

function PlacePin({ place, selected }: { readonly place: Place; readonly selected: boolean }) {
  const Icon = categoryIcons[place.category]
  const tone = sleeveTone[place.category]
  return (
    <div
      className={`relative flex size-7 items-center justify-center rounded-full shadow-sm transition-[box-shadow,transform] ${
        selected
          ? "scale-110 ring-2 ring-[var(--spine-gold)] ring-offset-1 ring-offset-[var(--parchment)]"
          : ""
      }`}
      style={{
        background: `color-mix(in srgb, var(--crate) 72%, ${tone})`,
        boxShadow: selected
          ? undefined
          : `0 0 0 2px color-mix(in srgb, ${tone} 55%, var(--parchment))`,
      }}
      aria-hidden
    >
      {place.status ? (
        <span
          className={`absolute inset-x-1 top-0.5 h-0.5 rounded-full ${
            place.status === "been_there"
              ? "bg-[color-mix(in_srgb,var(--parchment)_88%,var(--spine-gold))]"
              : "bg-[repeating-linear-gradient(-45deg,color-mix(in_srgb,var(--parchment)_85%,var(--spine-gold)),color-mix(in_srgb,var(--parchment)_85%,var(--spine-gold))_1px,transparent_1px,transparent_3px)]"
          }`}
        />
      ) : null}
      <Icon className="size-3.5 text-[var(--parchment)]" strokeWidth={2.25} />
    </div>
  )
}

function PlaceInfoContent({
  hit,
  distanceUnit,
}: {
  readonly hit: SearchHit
  readonly distanceUnit: "km" | "mi"
}) {
  const { place, distanceMeters } = hit
  const locality = pinLocality(place.address)
  const meta = [
    place.facts.cuisine,
    place.facts.rating != null ? `${place.facts.rating.toFixed(1)}★` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="flex max-w-[220px] gap-2.5 text-[var(--crate)]">
      {place.coverThumbUrl ? (
        <img
          src={place.coverThumbUrl}
          alt=""
          className="size-12 shrink-0 rounded-sm object-cover"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="font-catalog text-base font-semibold leading-tight tracking-wide uppercase">
          {place.name}
        </p>
        <p className="mt-0.5 text-[11px] tracking-wide text-[color-mix(in_srgb,var(--crate)_65%,transparent)] uppercase">
          {[
            categoryLabels[place.category],
            place.status ? statusLabels[place.status] : null,
            distanceMeters != null ? formatDistance(distanceMeters, distanceUnit) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {locality ? (
          <p className="mt-1 line-clamp-1 text-xs text-[color-mix(in_srgb,var(--crate)_70%,transparent)]">
            {locality}
          </p>
        ) : null}
        {meta ? (
          <p className="mt-0.5 text-xs text-[color-mix(in_srgb,var(--spine-gold)_80%,var(--crate))]">
            {meta}
          </p>
        ) : null}
        <Link
          to={`/places/${place.id}`}
          className="mt-2 inline-block text-xs font-medium text-[var(--action)] underline-offset-2 hover:underline"
        >
          Open
        </Link>
      </div>
    </div>
  )
}

function HitMarker({
  hit,
  selected,
  distanceUnit,
  onSelect,
  onDeselect,
}: {
  readonly hit: SearchHit
  readonly selected: boolean
  readonly distanceUnit: "km" | "mi"
  readonly onSelect: () => void
  readonly onDeselect: () => void
}) {
  const [markerRef, marker] = useAdvancedMarkerRef()
  const { place } = hit

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={place.location}
        title={place.name}
        onClick={onSelect}
        zIndex={selected ? 2 : 1}
      >
        <PlacePin place={place} selected={selected} />
      </AdvancedMarker>
      {selected && marker ? (
        <InfoWindow
          anchor={marker}
          headerDisabled
          maxWidth={260}
          onCloseClick={onDeselect}
          pixelOffset={[0, -4]}
        >
          <PlaceInfoContent hit={hit} distanceUnit={distanceUnit} />
        </InfoWindow>
      ) : null}
    </>
  )
}

function ResultsMapInner({
  hits,
  center,
  distanceUnit,
}: {
  readonly hits: ReadonlyArray<SearchHit>
  readonly center: { readonly lat: number; readonly lng: number } | null
  readonly distanceUnit: "km" | "mi"
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const defaultCenter = center ?? (hits[0] ? hits[0].place.location : { lat: 48.2, lng: 16.37 })

  useEffect(() => {
    if (selectedId && !hits.some((h) => h.place.id === selectedId)) {
      setSelectedId(null)
    }
  }, [hits, selectedId])

  return (
    <GoogleMap
      className="h-[min(60vh,520px)] min-h-[280px] overflow-hidden rounded-xl ring-1 ring-foreground/10"
      defaultCenter={defaultCenter}
      defaultZoom={center ? 12 : 3}
      gestureHandling="cooperative"
      mapId="DEMO_MAP_ID"
      disableDefaultUI
      zoomControl
      onClick={() => setSelectedId(null)}
    >
      <FitResults hits={hits} center={center} />
      {hits.map((hit) => (
        <HitMarker
          key={hit.place.id}
          hit={hit}
          selected={selectedId === hit.place.id}
          distanceUnit={distanceUnit}
          onSelect={() => setSelectedId(hit.place.id)}
          onDeselect={() => setSelectedId(null)}
        />
      ))}
    </GoogleMap>
  )
}

/** Map of the current search hits. Needs a Maps JavaScript API key. */
export default function ResultsMap({
  apiKey,
  hits,
  center,
  distanceUnit,
}: {
  readonly apiKey: string
  readonly hits: ReadonlyArray<SearchHit>
  readonly center: { readonly lat: number; readonly lng: number } | null
  readonly distanceUnit: "km" | "mi"
}) {
  if (hits.length === 0) {
    return (
      <p className="rounded-xl bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
        No places to show on the map for this search.
      </p>
    )
  }

  return (
    <APIProvider apiKey={apiKey}>
      <ResultsMapInner hits={hits} center={center} distanceUnit={distanceUnit} />
    </APIProvider>
  )
}
