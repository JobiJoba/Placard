import { Schema } from "effect"
import { Place, PlaceCategory, PlaceStatus, LatLng } from "./places.ts"

/** When a place should be open relative to the searcher's "now". */
export const openWhenValues = ["now", "tonight"] as const
export const OpenWhen = Schema.Literals(openWhenValues)
export type OpenWhen = typeof OpenWhen.Type

/**
 * Structured library search. All fields combine (AND). Shared by UI, API, and MCP.
 * `near` + `radiusKm` together mean "within N km of this point"; either alone is ignored.
 */
export const SearchFilter = Schema.Struct({
  text: Schema.optional(
    Schema.Trim.pipe(Schema.check(Schema.isBetweenLength(1, 200))),
  ),
  category: Schema.optional(PlaceCategory),
  open: Schema.optional(OpenWhen),
  near: Schema.optional(LatLng),
  radiusKm: Schema.optional(
    Schema.Number.pipe(
      Schema.check(Schema.isGreaterThan(0, { message: "Radius must be positive" })),
      Schema.check(Schema.isLessThanOrEqualTo(500, { message: "Radius max is 500 km" })),
    ),
  ),
  tag: Schema.optional(Schema.String),
  list: Schema.optional(Schema.String),
  status: Schema.optional(PlaceStatus),
})
export type SearchFilter = typeof SearchFilter.Type

/** A place matched by search, with distance when a radius center was given. */
export const SearchHit = Schema.Struct({
  place: Place,
  distanceMeters: Schema.NullOr(Schema.Number),
})
export type SearchHit = typeof SearchHit.Type
