import { Schema } from "effect"

export const placeCategories = [
  "restaurant",
  "cafe",
  "bar",
  "park",
  "museum",
  "cinema",
  "hotel",
  "trail",
  "other",
] as const

export const PlaceCategory = Schema.Literals(placeCategories)
export type PlaceCategory = typeof PlaceCategory.Type

export const placeSources = ["manual", "autocomplete", "map_pick", "takeout", "mcp"] as const
export const PlaceSource = Schema.Literals(placeSources)
export type PlaceSource = typeof PlaceSource.Type

export const placeStatuses = ["want_to_go", "been_there"] as const
export const PlaceStatus = Schema.Literals(placeStatuses)
export type PlaceStatus = typeof PlaceStatus.Type

export const LatLng = Schema.Struct({
  lat: Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: -90, maximum: 90 }))),
  lng: Schema.Finite.pipe(Schema.check(Schema.isBetween({ minimum: -180, maximum: 180 }))),
})
export type LatLng = typeof LatLng.Type

export const Place = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  category: PlaceCategory,
  location: LatLng,
  address: Schema.NullOr(Schema.String),
  googlePlaceId: Schema.NullOr(Schema.String),
  status: Schema.NullOr(PlaceStatus),
  source: PlaceSource,
  createdAt: Schema.DateTimeUtcFromString,
})
export type Place = typeof Place.Type

/** `created` is false when the place was already in the library. */
export const SavedPlace = Schema.Struct({
  place: Place,
  created: Schema.Boolean,
})
export type SavedPlace = typeof SavedPlace.Type

export const PlaceName = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1, { message: "Give the place a name" })),
  Schema.check(Schema.isMaxLength(200)),
)

export const ManualPlaceInput = Schema.Struct({
  name: PlaceName,
  category: PlaceCategory,
  location: LatLng,
  address: Schema.NullOr(Schema.Trim),
})
export type ManualPlaceInput = typeof ManualPlaceInput.Type

export const GooglePlaceInput = Schema.Struct({
  googlePlaceId: Schema.NonEmptyString,
  source: Schema.Literals(["autocomplete", "map_pick"]),
  sessionToken: Schema.NullOr(Schema.String),
})
export type GooglePlaceInput = typeof GooglePlaceInput.Type

export const PlaceSuggestion = Schema.Struct({
  googlePlaceId: Schema.String,
  primaryText: Schema.String,
  secondaryText: Schema.NullOr(Schema.String),
})
export type PlaceSuggestion = typeof PlaceSuggestion.Type

export const AutocompleteInput = Schema.Struct({
  input: Schema.Trim.pipe(Schema.check(Schema.isBetweenLength(1, 200))),
  sessionToken: Schema.NonEmptyString,
  near: Schema.NullOr(LatLng),
})
export type AutocompleteInput = typeof AutocompleteInput.Type

/** What Google knows about a place, plus whether it's already in your library. */
export const PlacePreview = Schema.Struct({
  googlePlaceId: Schema.String,
  name: Schema.String,
  address: Schema.NullOr(Schema.String),
  location: LatLng,
  category: PlaceCategory,
  existingPlaceId: Schema.NullOr(Schema.String),
})
export type PlacePreview = typeof PlacePreview.Type

export const GoogleConfig = Schema.Struct({
  mapsApiKey: Schema.NullOr(Schema.String),
})
export type GoogleConfig = typeof GoogleConfig.Type

export class PlaceNotFound extends Schema.TaggedError<PlaceNotFound>()(
  "PlaceNotFound",
  {},
  { httpApiStatus: 404 },
) {}

export class GoogleKeyMissing extends Schema.TaggedError<GoogleKeyMissing>()(
  "GoogleKeyMissing",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

export class GooglePlacesFailed extends Schema.TaggedError<GooglePlacesFailed>()(
  "GooglePlacesFailed",
  { message: Schema.String },
  { httpApiStatus: 502 },
) {}

export type GooglePlacesError = GoogleKeyMissing | GooglePlacesFailed
