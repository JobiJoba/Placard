import "leaflet/dist/leaflet.css"
import type { LatLng, PlaceCategory } from "@placard/domain"
import { type FormEvent, useEffect, useId, useState } from "react"
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet"
import { useNavigate } from "react-router"
import { MapLocateBar } from "@/components/add/map-locate-bar"
import { ErrorAlert } from "@/components/error-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api, errorMessage } from "@/lib/api"
import { type MapStart, useMapStart } from "@/lib/map-start"
import { categoryGroups, isPlaceCategory } from "@/lib/place-categories"
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

const parseCoord = (raw: string): number | null => {
  const value = Number(raw.trim())
  return Number.isFinite(value) ? value : null
}

/** Drop a pin on an OpenStreetMap map and name it; needs no Google key. */
export default function PinDropper() {
  const navigate = useNavigate()
  const mapLabelId = useId()
  const { start, locating, message, locate, commitStart } = useMapStart()
  const [location, setLocation] = useState<LatLng | null>(null)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<PlaceCategory | "">("")
  const [address, setAddress] = useState("")
  const [coordLat, setCoordLat] = useState("")
  const [coordLng, setCoordLng] = useState("")
  const [coordError, setCoordError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pinAnnouncement, setPinAnnouncement] = useState("")

  const dropPin = (next: LatLng) => {
    setLocation(next)
    setCoordLat(next.lat.toFixed(5))
    setCoordLng(next.lng.toFixed(5))
    setCoordError(null)
    commitStart({ center: next, zoom: Math.max(start.zoom, 15) }, { lock: true })
    setPinAnnouncement(`Pin dropped at ${formatCoordinates({ location: next })}`)
  }

  const applyCoordinates = (event: FormEvent) => {
    event.preventDefault()
    const lat = parseCoord(coordLat)
    const lng = parseCoord(coordLng)
    if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setCoordError("Enter valid latitude (−90…90) and longitude (−180…180).")
      return
    }
    dropPin({ lat, lng })
  }

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!location || !category) return
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
      <p className="text-sm text-muted-foreground">
        For somewhere Google doesn’t list. Tap the map, or enter coordinates.
      </p>
      <MapLocateBar locating={locating} message={message} onLocate={locate} />
      <div data-testid="pin-map">
        <p id={mapLabelId} className="sr-only">
          Map for dropping a custom pin. Tap to set the location.
        </p>
        <MapContainer
          center={[start.center.lat, start.center.lng]}
          zoom={start.zoom}
          worldCopyJump
          aria-labelledby={mapLabelId}
          className="z-0 h-[min(50vh,360px)] min-h-[240px] rounded-md ring-1 ring-foreground/10"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <Recenter start={start} />
          <PinOnClick onPin={dropPin} />
          {location && (
            <CircleMarker
              center={location}
              radius={11}
              pathOptions={{ weight: 3, color: "#8b3a2a", fillColor: "#c4a574", fillOpacity: 0.85 }}
            />
          )}
        </MapContainer>
      </div>
      <p className="sr-only" aria-live="polite">
        {pinAnnouncement}
      </p>

      {!location ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-[var(--crate)]">Tap the map to drop a pin.</p>
          <form
            onSubmit={applyCoordinates}
            className="flex flex-col gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] p-3"
          >
            <p className="text-sm font-medium">Enter coordinates instead</p>
            <FieldGroup className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="pin-coord-lat">Latitude</FieldLabel>
                <Input
                  id="pin-coord-lat"
                  inputMode="decimal"
                  autoComplete="off"
                  value={coordLat}
                  onChange={(e) => setCoordLat(e.target.value)}
                  placeholder="48.20820"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pin-coord-lng">Longitude</FieldLabel>
                <Input
                  id="pin-coord-lng"
                  inputMode="decimal"
                  autoComplete="off"
                  value={coordLng}
                  onChange={(e) => setCoordLng(e.target.value)}
                  placeholder="16.37380"
                />
              </Field>
            </FieldGroup>
            {coordError && <p className="text-sm text-destructive">{coordError}</p>}
            <Button type="submit" variant="outline" className="w-fit">
              Set pin
            </Button>
          </form>
        </div>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Pinned at {formatCoordinates({ location })} — this becomes a card in your library.
          </p>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="pin-name">Name</FieldLabel>
              <Input
                id="pin-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="pin-type">Type</FieldLabel>
              <Select
                value={category || undefined}
                onValueChange={(v) => {
                  if (isPlaceCategory(v)) setCategory(v)
                }}
                required
              >
                <SelectTrigger id="pin-type" className="w-56">
                  <SelectValue placeholder="Choose type" />
                </SelectTrigger>
                <SelectContent>
                  {categoryGroups.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.values.map((value) => (
                        <SelectItem key={value} value={value}>
                          {categoryLabels[value]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
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
              />
            </Field>
          </FieldGroup>
          <ErrorAlert message={error} />
          <Button type="submit" disabled={saving || !name.trim() || !category} className="w-fit">
            {saving ? "Saving…" : "Save place"}
          </Button>
        </form>
      )}
    </div>
  )
}
