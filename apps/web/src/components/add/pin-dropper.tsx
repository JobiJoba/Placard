import "leaflet/dist/leaflet.css"
import { type LatLng, type PlaceCategory, placeCategories } from "@placard/domain"
import { type FormEvent, useState } from "react"
import { CircleMarker, MapContainer, TileLayer, useMapEvents } from "react-leaflet"
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
import { api, errorMessage } from "@/lib/api"
import { categoryLabels, formatCoordinates } from "@/lib/places"

const WORLD: [number, number] = [30, 10]

function PinOnClick({ onPin }: { readonly onPin: (location: LatLng) => void }) {
  useMapEvents({
    click: (event) => {
      const { lat, lng } = event.latlng.wrap()
      onPin({ lat, lng })
    },
  })
  return null
}

/** Drop a pin on an OpenStreetMap map and name it; needs no Google key. */
export default function PinDropper() {
  const navigate = useNavigate()
  const [location, setLocation] = useState<LatLng | null>(null)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<PlaceCategory>("other")
  const [address, setAddress] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Click the map where the place is.</p>
      <div data-testid="pin-map">
        <MapContainer
          center={WORLD}
          zoom={2}
          worldCopyJump
          className="z-0 h-[420px] rounded-xl ring-1 ring-foreground/10"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <PinOnClick onPin={setLocation} />
          {location && <CircleMarker center={location} radius={9} pathOptions={{ weight: 3 }} />}
        </MapContainer>
      </div>

      <form onSubmit={save} className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="pin-name">Name</FieldLabel>
            <Input
              id="pin-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="pin-category">Type</FieldLabel>
            <Select value={category} onValueChange={(value) => setCategory(value as PlaceCategory)}>
              <SelectTrigger id="pin-category" className="w-48">
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
              onChange={(event) => setAddress(event.target.value)}
            />
          </Field>
        </FieldGroup>
        <ErrorAlert message={error} />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!location || saving}>
            {saving ? "Saving…" : "Save place"}
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {location ? `Pinned at ${formatCoordinates({ location })}` : "No pin yet"}
          </span>
        </div>
      </form>
    </div>
  )
}
