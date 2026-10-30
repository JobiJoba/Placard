import { Schema } from "effect"
import { PlaceCustomField } from "./custom-fields.ts"
import { PlaceCategory, PlaceSource, PlaceStatus } from "./places.ts"

/** Bump when the on-disk export document shape changes. */
export const exportFormatVersion = 1 as const

export const ExportOwner = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
})
export type ExportOwner = typeof ExportOwner.Type

export const ExportPlace = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  category: PlaceCategory,
  location: Schema.Struct({ lat: Schema.Number, lng: Schema.Number }),
  address: Schema.NullOr(Schema.String),
  googlePlaceId: Schema.NullOr(Schema.String),
  status: Schema.NullOr(PlaceStatus),
  notes: Schema.NullOr(Schema.String),
  source: PlaceSource,
  editedFields: Schema.Array(Schema.String),
  tagIds: Schema.Array(Schema.String),
  listIds: Schema.Array(Schema.String),
  facts: Schema.Unknown,
  customFields: Schema.Array(PlaceCustomField),
  coverMediaId: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
})
export type ExportPlace = typeof ExportPlace.Type

export const ExportList = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  placeIds: Schema.Array(Schema.String),
  createdAt: Schema.String,
})
export type ExportList = typeof ExportList.Type

export const ExportTag = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
})
export type ExportTag = typeof ExportTag.Type

export const ExportMediaEntry = Schema.Struct({
  id: Schema.String,
  placeId: Schema.String,
  kind: Schema.String,
  origin: Schema.String,
  mimeType: Schema.String,
  bytes: Schema.Number,
  width: Schema.NullOr(Schema.Number),
  height: Schema.NullOr(Schema.Number),
  caption: Schema.NullOr(Schema.String),
  takenAt: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  /** Path inside the zip, e.g. `media/<id>.jpg`. */
  path: Schema.String,
  thumbPath: Schema.NullOr(Schema.String),
})
export type ExportMediaEntry = typeof ExportMediaEntry.Type

/** Contents of `placard.json` inside the export zip. */
export const ExportDocument = Schema.Struct({
  version: Schema.Literal(exportFormatVersion),
  exportedAt: Schema.String,
  owner: ExportOwner,
  places: Schema.Array(ExportPlace),
  lists: Schema.Array(ExportList),
  tags: Schema.Array(ExportTag),
  media: Schema.Array(ExportMediaEntry),
})
export type ExportDocument = typeof ExportDocument.Type
