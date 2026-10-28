import { Schema } from "effect"
import { Place } from "./places.ts"
import { SearchFilter } from "./search.ts"

/** Pool + filters for a Decide spin. Category is forced to restaurant on the server. */
export const DecideRequest = Schema.Struct({
  ...SearchFilter.fields,
  avoidRecent: Schema.Boolean,
})
export type DecideRequest = typeof DecideRequest.Type

export const DecidePreview = Schema.Struct({
  count: Schema.Number,
})
export type DecidePreview = typeof DecidePreview.Type

export const DecideResult = Schema.Struct({
  place: Place,
})
export type DecideResult = typeof DecideResult.Type

export class DecidePoolEmpty extends Schema.TaggedError<DecidePoolEmpty>()(
  "DecidePoolEmpty",
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}
