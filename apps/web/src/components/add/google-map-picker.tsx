import type { PlacePreview } from "@placard/domain"
import {
  APIProvider,
  Map as GoogleMap,
  type MapMouseEvent,
  useMap,
} from "@vis.gl/react-google-maps"
import { useEffect, useState } from "react"
import { MapLocateBar } from "@/components/add/map-locate-bar"
import { ErrorAlert } from "@/components/error-alert"
import { api, errorMessage } from "@/lib/api"
import { type MapStart, useMapStart } from "@/lib/map-start"
import { GooglePreviewCard } from "./google-preview"

function ApplyStart({ start }: { readonly start: MapStart }) {
  const map = useMap()
  useEffect(() => {
    if (!map) return
    map.setCenter(start.center)
    map.setZoom(start.zoom)
  }, [map, start])
  return null
}

/** Tap a point of interest on Google's map to preview and save it. */
export default function GoogleMapPicker({ apiKey }: { readonly apiKey: string }) {
  const { start, locating, message, locate, commitStart } = useMapStart()
  const [preview, setPreview] = useState<PlacePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [emptyClickHint, setEmptyClickHint] = useState(false)

  const onClick = (event: MapMouseEvent) => {
    const googlePlaceId = event.detail.placeId
    if (!googlePlaceId) {
      setEmptyClickHint(true)
      return
    }
    event.stop()
    setEmptyClickHint(false)
    setError(null)
    const lat = event.detail.latLng?.lat
    const lng = event.detail.latLng?.lng
    if (typeof lat === "number" && typeof lng === "number") {
      commitStart({ center: { lat, lng }, zoom: Math.max(start.zoom, 15) }, { lock: true })
    }
    api((c) => c.google.preview({ params: { googlePlaceId }, query: {} })).then(
      setPreview,
      (cause: unknown) => setError(errorMessage(cause)),
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Zoom in and tap a Google place (restaurant, park, etc.) — empty map taps won’t work.
      </p>
      <MapLocateBar locating={locating} message={message} onLocate={locate} />
      <APIProvider apiKey={apiKey}>
        <GoogleMap
          className="h-[min(50vh,360px)] min-h-[240px] overflow-hidden rounded-md ring-1 ring-foreground/10"
          defaultCenter={start.center}
          defaultZoom={start.zoom}
          gestureHandling="cooperative"
          clickableIcons
          disableDefaultUI
          zoomControl
          onClick={onClick}
          aria-label="Google map for picking a place"
        >
          <ApplyStart start={start} />
        </GoogleMap>
      </APIProvider>
      {emptyClickHint && (
        <p className="text-sm font-medium text-[var(--crate)]" role="status">
          That wasn’t a Google place. Zoom closer and tap a labeled spot.
        </p>
      )}
      <ErrorAlert message={error} />
      {preview && <GooglePreviewCard preview={preview} source="map_pick" sessionToken={null} />}
    </div>
  )
}
