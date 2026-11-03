import type { Place, PlaceCategory, PlaceSource, PlaceStatus } from "@placard/domain"
import {
  BedDouble,
  Beer,
  BookOpen,
  CakeSlice,
  Clapperboard,
  Coffee,
  Dumbbell,
  Eye,
  FerrisWheel,
  Flower2,
  Grape,
  IceCreamBowl,
  Landmark,
  type LucideIcon,
  MapPin,
  Mountain,
  Palette,
  ParkingCircle,
  PawPrint,
  Plane,
  ShoppingBag,
  Sparkles,
  Store,
  Tent,
  Theater,
  TrainFront,
  Trees,
  Trophy,
  UtensilsCrossed,
  Waves,
  Wine,
} from "lucide-react"

const builtinLabels: Record<string, string> = {
  restaurant: "Restaurant",
  cafe: "Café",
  bar: "Bar",
  park: "Park",
  museum: "Museum",
  cinema: "Cinema",
  hotel: "Hotel",
  trail: "Trail",
  bakery: "Bakery",
  ice_cream: "Ice cream shop",
  brewery: "Brewery",
  winery: "Winery",
  beach: "Beach",
  garden: "Garden",
  viewpoint: "Viewpoint",
  lake: "Lake",
  campground: "Campground",
  gallery: "Art gallery",
  theatre: "Theatre",
  library: "Library",
  landmark: "Landmark",
  shop: "Shop",
  bookshop: "Bookshop",
  market: "Market",
  gym: "Gym",
  spa: "Spa",
  swimming_pool: "Swimming pool",
  sports_venue: "Sports venue",
  zoo: "Zoo",
  amusement_park: "Amusement park",
  hostel: "Hostel",
  airport: "Airport",
  train_station: "Train station",
  parking: "Parking",
  other: "Other",
}

const builtinIcons: Record<string, LucideIcon> = {
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  bar: Wine,
  park: Trees,
  museum: Landmark,
  cinema: Clapperboard,
  hotel: BedDouble,
  trail: Mountain,
  bakery: CakeSlice,
  ice_cream: IceCreamBowl,
  brewery: Beer,
  winery: Grape,
  beach: Waves,
  garden: Flower2,
  viewpoint: Eye,
  lake: Waves,
  campground: Tent,
  gallery: Palette,
  theatre: Theater,
  library: BookOpen,
  landmark: Landmark,
  shop: ShoppingBag,
  bookshop: BookOpen,
  market: Store,
  gym: Dumbbell,
  spa: Sparkles,
  swimming_pool: Waves,
  sports_venue: Trophy,
  zoo: PawPrint,
  amusement_park: FerrisWheel,
  hostel: BedDouble,
  airport: Plane,
  train_station: TrainFront,
  parking: ParkingCircle,
  other: MapPin,
}

export const categoryLabel = (category: PlaceCategory): string =>
  Object.hasOwn(builtinLabels, category) ? (builtinLabels[category] ?? category) : category

export const categoryIcon = (category: PlaceCategory): LucideIcon =>
  Object.hasOwn(builtinIcons, category) ? (builtinIcons[category] ?? MapPin) : MapPin

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

export const formatDistance = (meters: number, unit: "km" | "mi") => {
  if (unit === "mi") {
    const miles = meters / 1609.344
    return miles < 0.1
      ? `${Math.round(meters * 3.28084)} ft`
      : `${miles.toFixed(miles < 10 ? 1 : 0)} mi`
  }
  const km = meters / 1000
  return km < 1 ? `${Math.round(meters)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`
}

export const categoryTone = (category: PlaceCategory): string => {
  if (["restaurant", "bakery", "ice_cream"].includes(category)) return "oklch(0.72 0.06 55)"
  if (["cafe", "shop", "bookshop", "market"].includes(category)) return "oklch(0.78 0.05 85)"
  if (["bar", "brewery", "winery"].includes(category)) return "oklch(0.55 0.06 30)"
  if (["park", "garden", "zoo"].includes(category)) return "oklch(0.72 0.07 145)"
  if (["trail", "viewpoint", "campground"].includes(category)) return "oklch(0.68 0.07 130)"
  if (["museum", "gallery", "library", "landmark"].includes(category)) return "oklch(0.7 0.04 250)"
  if (["cinema", "theatre", "amusement_park"].includes(category)) return "oklch(0.58 0.05 320)"
  if (["hotel", "hostel", "beach", "lake", "swimming_pool", "spa"].includes(category))
    return "oklch(0.74 0.04 220)"
  return "oklch(0.7 0.03 70)"
}
