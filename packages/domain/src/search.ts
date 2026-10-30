import { Schema } from "effect"
import { LatLng, Place, PlaceCategory, PlaceStatus } from "./places.ts"

/** When a place should be open relative to the searcher's "now". */
export const openWhenValues = ["now", "tonight"] as const
export const OpenWhen = Schema.Literals(openWhenValues)
export type OpenWhen = typeof OpenWhen.Type

export const householdScopes = ["all", "mine", "shared"] as const
export const HouseholdScope = Schema.Literals(householdScopes)
export type HouseholdScope = typeof HouseholdScope.Type

/**
 * Structured library search. All fields combine (AND). Shared by UI, API, and MCP.
 * `near` + `radiusKm` together mean "within N km of this point"; either alone is ignored.
 * `householdScope` / `sharedBy` only apply when household mode is on (ignored otherwise).
 */
export const SearchFilter = Schema.Struct({
  text: Schema.optional(Schema.Trim.pipe(Schema.check(Schema.isBetweenLength(1, 200)))),
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
  /** Ownership filter; default `all` when omitted. */
  householdScope: Schema.optional(HouseholdScope),
  /** Further narrow to places owned by this member (AND with householdScope). */
  sharedBy: Schema.optional(Schema.String),
})
export type SearchFilter = typeof SearchFilter.Type

/** A place matched by search, with distance when a radius center was given. */
export const SearchHit = Schema.Struct({
  place: Place,
  distanceMeters: Schema.NullOr(Schema.Number),
})
export type SearchHit = typeof SearchHit.Type
