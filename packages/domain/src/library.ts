import { Schema } from "effect"
import { PlaceStatus } from "./places.ts"

const name = (max: number, message: string) =>
  Schema.Trim.pipe(
    Schema.check(Schema.isMinLength(1, { message })),
    Schema.check(Schema.isMaxLength(max)),
  )

export const TagName = name(50, "Give the tag a name")
export const ListName = name(100, "Give the list a name")
const Description = Schema.NullOr(Schema.Trim.pipe(Schema.check(Schema.isMaxLength(500))))

export const TagSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  placeCount: Schema.Number,
})
export type TagSummary = typeof TagSummary.Type

export const PlaceList = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  placeCount: Schema.Number,
  createdAt: Schema.DateTimeUtcFromString,
})
export type PlaceList = typeof PlaceList.Type

export const ListInput = Schema.Struct({ name: ListName, description: Description })
export type ListInput = typeof ListInput.Type

export const ListUpdate = Schema.Struct({
  name: Schema.optional(ListName),
  description: Schema.optional(Description),
})
export type ListUpdate = typeof ListUpdate.Type

export const PlaceIds = Schema.Array(Schema.String).pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isMaxLength(1000)),
)

export const BulkAction = Schema.Union([
  Schema.TaggedStruct("addTag", { tagName: TagName }),
  Schema.TaggedStruct("removeTag", { tagId: Schema.String }),
  Schema.TaggedStruct("addToList", { listId: Schema.String }),
  Schema.TaggedStruct("removeFromList", { listId: Schema.String }),
  Schema.TaggedStruct("setStatus", { status: Schema.NullOr(PlaceStatus) }),
  Schema.TaggedStruct("delete", {}),
])
export type BulkAction = typeof BulkAction.Type

/** Applied to every place or to none. */
export const BulkInput = Schema.Struct({ placeIds: PlaceIds, action: BulkAction })
export type BulkInput = typeof BulkInput.Type

export const BulkResult = Schema.Struct({ affected: Schema.Number })
export type BulkResult = typeof BulkResult.Type

export class TagNotFound extends Schema.TaggedError<TagNotFound>()(
  "TagNotFound",
  {},
  { httpApiStatus: 404 },
) {}

export class ListNotFound extends Schema.TaggedError<ListNotFound>()(
  "ListNotFound",
  {},
  { httpApiStatus: 404 },
) {}

export class NameTaken extends Schema.TaggedError<NameTaken>()(
  "NameTaken",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}
