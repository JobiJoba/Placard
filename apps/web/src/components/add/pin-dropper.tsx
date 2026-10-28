import "leaflet/dist/leaflet.css"
import { type LatLng, type PlaceCategory, placeCategories } from "@placard/domain"
import { type FormEvent, useEffect, useState } from "react"
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet"
import { useNavigate } from "react-router"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { api, errorMessage } from "@/lib/api"
import { type MapStart, resolveMapStart } from "@/lib/map-start"
import { categoryLabels, formatCoordinates } from "@/lib/places"

function PinOnClick({ onPin }: { readonly onPin: (location: LatLng) => void }) {
  useMapEvents({
    click: (event) => {
      const { lat, lng } = event.latlng.wrap()
      onPin({ lat, lng })
    },
  })
  return null
}

function Recenter({ start }: { readonly start: MapStart }) {
  const map = useMap()
  useEffect(() => {
    map.setView([start.center.lat, start.center.lng], start.zoom)
  }, [map, start])
  return null
}

/** Drop a pin on an OpenStreetMap map and name it; needs no Google key. */
export default function PinDropper() {
  const navigate = useNavigate()
  const [start, setStart] = useState<MapStart | null>(null)
  const [location, setLocation] = useState<LatLng | null>(null)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<PlaceCategory>("other")
  const [address, setAddress] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void resolveMapStart().then(setStart)
  }, [])

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!location) return
    setSaving(true)
    setError(null)
    api((c) =>
      c.places.addManual({
        payload: { name, category, location, address: address.trim() || null },
      }),
    ).then(
      ({ place }) => navigate(`/places/${place.id}`),
      (cause: unknown) => {
        setError(errorMessage(cause))
        setSaving(false)
      },
    )
  }

  if (!start) return <Skeleton className="h-[min(50vh,360px)] min-h-[240px] rounded-xl" />

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Drop a custom pin (not a Google place). Click the map where it is.
      </p>
      <div data-testid="pin-map">
        <MapContainer
          center={[start.center.lat, start.center.lng]}
          zoom={start.zoom}
          worldCopyJump
          className="z-0 h-[min(50vh,360px)] min-h-[240px] rounded-xl ring-1 ring-foreground/10"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <Recenter start={start} />
          <PinOnClick onPin={setLocation} />
          {location && <CircleMarker center={location} radius={9} pathOptions={{ weight: 3 }} />}
        </MapContainer>
      </div>

      {!location && (
        <p className="text-sm font-medium text-muted-foreground">
          Tap the map to drop a pin first.
        </p>
      )}

      <form onSubmit={save} className="flex flex-col gap-4">
        {location && (
          <p className="text-sm text-muted-foreground">
            Pinned at {formatCoordinates({ location })}
          </p>
        )}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="pin-name">Name</FieldLabel>
            <Input
              id="pin-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={!location}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="pin-type">Type</FieldLabel>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as PlaceCategory)}
              disabled={!location}
            >
              <SelectTrigger id="pin-type" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {placeCategories.map((value) => (
                  <SelectItem key={value} value={value}>
                    {categoryLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="pin-address">Address (optional)</FieldLabel>
            <Input
              id="pin-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={!location}
            />
          </Field>
        </FieldGroup>
        <ErrorAlert message={error} />
        <Button type="submit" disabled={!location || saving || !name.trim()} className="w-fit">
          {saving ? "Saving…" : "Save place"}
        </Button>
      </form>
    </div>
  )
}
