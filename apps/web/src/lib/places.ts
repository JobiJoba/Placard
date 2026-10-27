import type { Place, PlaceCategory, PlaceSource, PlaceStatus } from "@placard/domain"
import {
  BedDouble,
  Clapperboard,
  Coffee,
  Landmark,
  type LucideIcon,
  MapPin,
  Mountain,
  Trees,
  UtensilsCrossed,
  Wine,
} from "lucide-react"

export const categoryLabels: Record<PlaceCategory, string> = {
  restaurant: "Restaurant",
  cafe: "Café",
  bar: "Bar",
  park: "Park",
  museum: "Museum",
  cinema: "Cinema",
  hotel: "Hotel",
  trail: "Trail",
  other: "Other",
}

export const categoryIcons: Record<PlaceCategory, LucideIcon> = {
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  bar: Wine,
  park: Trees,
  museum: Landmark,
  cinema: Clapperboard,
  hotel: BedDouble,
  trail: Mountain,
  other: MapPin,
}

export const sourceLabels: Record<PlaceSource, string> = {
  manual: "Dropped pin",
  autocomplete: "Search",
  map_pick: "Map",
  takeout: "Google Takeout",
  mcp: "Assistant",
}

export const statusLabels: Record<PlaceStatus, string> = {
  want_to_go: "Want to go",
  been_there: "Been there",
}

export const formatCoordinates = ({ location }: Pick<Place, "location">) =>
  `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
