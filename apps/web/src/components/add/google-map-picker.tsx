import type { PlacePreview } from "@placard/domain"
import { APIProvider, Map as GoogleMap, type MapMouseEvent } from "@vis.gl/react-google-maps"
import { useState } from "react"
import { ErrorAlert } from "@/components/error-alert"
import { api, errorMessage } from "@/lib/api"
import { GooglePreviewCard } from "./google-preview"

const WORLD = { lat: 30, lng: 10 }

/** Click a point of interest on Google's map to preview and save it. */
export default function GoogleMapPicker({ apiKey }: { readonly apiKey: string }) {
  const [preview, setPreview] = useState<PlacePreview | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Zoom in and click any place on the map to see it here.
      </p>
      <APIProvider apiKey={apiKey}>
        <GoogleMap
          className="h-[420px] overflow-hidden rounded-xl ring-1 ring-foreground/10"
          defaultCenter={WORLD}
          defaultZoom={2}
          gestureHandling="greedy"
          clickableIcons
          disableDefaultUI
          zoomControl
          onClick={onClick}
        />
      </APIProvider>
      <ErrorAlert message={error} />
      {preview && <GooglePreviewCard preview={preview} source="map_pick" sessionToken={null} />}
    </div>
  )
}
