import type { PlacePreview } from "@placard/domain"
import {
  APIProvider,
  Map as GoogleMap,
  type MapMouseEvent,
  useMap,
} from "@vis.gl/react-google-maps"
import { useEffect, useState } from "react"
import { ErrorAlert } from "@/components/error-alert"
import { Skeleton } from "@/components/ui/skeleton"
import { api, errorMessage } from "@/lib/api"
import { type MapStart, resolveMapStart } from "@/lib/map-start"
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

/** Click a point of interest on Google's map to preview and save it. */
export default function GoogleMapPicker({ apiKey }: { readonly apiKey: string }) {
  const [start, setStart] = useState<MapStart | null>(null)
  const [preview, setPreview] = useState<PlacePreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void resolveMapStart().then(setStart)
  }, [])

  const onClick = (event: MapMouseEvent) => {
    const googlePlaceId = event.detail.placeId
    if (!googlePlaceId) return
    event.stop()
    setError(null)
    api((c) => c.google.preview({ params: { googlePlaceId }, query: {} })).then(
      setPreview,
      (cause: unknown) => setError(errorMessage(cause)),
    )
  }

  if (!start) return <Skeleton className="h-[min(50vh,360px)] min-h-[240px] rounded-xl" />

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Zoom in and click a Google place (restaurant, park, etc.) — not an empty pin.
      </p>
      <APIProvider apiKey={apiKey}>
        <GoogleMap
          className="h-[min(50vh,360px)] min-h-[240px] overflow-hidden rounded-xl ring-1 ring-foreground/10"
          defaultCenter={start.center}
          defaultZoom={start.zoom}
          gestureHandling="cooperative"
          clickableIcons
          disableDefaultUI
          zoomControl
          onClick={onClick}
        >
          <ApplyStart start={start} />
        </GoogleMap>
      </APIProvider>
      <ErrorAlert message={error} />
      {preview && <GooglePreviewCard preview={preview} source="map_pick" sessionToken={null} />}
    </div>
  )
}
