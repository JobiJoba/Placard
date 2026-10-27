import type { SearchHit } from "@placard/domain"
import { AdvancedMarker, APIProvider, Map as GoogleMap } from "@vis.gl/react-google-maps"
import { Link } from "react-router"

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

  return (
    <APIProvider apiKey={apiKey}>
      <GoogleMap
        className="h-[420px] overflow-hidden rounded-xl ring-1 ring-foreground/10"
        defaultCenter={defaultCenter}
        defaultZoom={center ? 12 : 3}
        gestureHandling="greedy"
        mapId="DEMO_MAP_ID"
        disableDefaultUI
        zoomControl
      >
        {hits.map(({ place }) => (
          <AdvancedMarker key={place.id} position={place.location} title={place.name}>
            <Link
              to={`/places/${place.id}`}
              className="block max-w-40 truncate rounded-md bg-foreground px-2 py-1 text-xs text-background shadow"
            >
              {place.name}
            </Link>
          </AdvancedMarker>
        ))}
      </GoogleMap>
    </APIProvider>
  )
}
