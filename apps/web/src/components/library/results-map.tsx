import type { SearchHit } from "@placard/domain"
import { AdvancedMarker, APIProvider, Map as GoogleMap, useMap } from "@vis.gl/react-google-maps"
import { useEffect } from "react"
import { Link } from "react-router"

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

/** Map of the current search hits. Needs a Maps JavaScript API key. */
export default function ResultsMap({
  apiKey,
  hits,
  center,
}: {
  readonly apiKey: string
  readonly hits: ReadonlyArray<SearchHit>
  readonly center: { readonly lat: number; readonly lng: number } | null
}) {
  const defaultCenter = center ?? (hits[0] ? hits[0].place.location : { lat: 48.2, lng: 16.37 })

  if (hits.length === 0) {
    return (
      <p className="rounded-xl bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
        No places to show on the map for this search.
      </p>
    )
  }

  return (
    <APIProvider apiKey={apiKey}>
      <GoogleMap
        className="h-[min(60vh,520px)] min-h-[280px] overflow-hidden rounded-xl ring-1 ring-foreground/10"
        defaultCenter={defaultCenter}
        defaultZoom={center ? 12 : 3}
        gestureHandling="cooperative"
        mapId="DEMO_MAP_ID"
        disableDefaultUI
        zoomControl
      >
        <FitResults hits={hits} center={center} />
        {hits.map(({ place }) => (
          <AdvancedMarker key={place.id} position={place.location} title={place.name}>
            <Link
              to={`/places/${place.id}`}
              className="block size-3 rounded-full bg-foreground ring-2 ring-background"
              aria-label={place.name}
            />
          </AdvancedMarker>
        ))}
      </GoogleMap>
    </APIProvider>
  )
}
