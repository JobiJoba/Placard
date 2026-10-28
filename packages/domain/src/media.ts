import { Schema } from "effect"

export const mediaKinds = ["dish", "photo", "attachment"] as const
export const MediaKind = Schema.Literals(mediaKinds)
export type MediaKind = typeof MediaKind.Type

export const MediaItem = Schema.Struct({
  id: Schema.String,
  placeId: Schema.String,
  kind: MediaKind,
  mimeType: Schema.String,
  bytes: Schema.Number,
  width: Schema.NullOr(Schema.Number),
  height: Schema.NullOr(Schema.Number),
  caption: Schema.NullOr(Schema.String),
  takenAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  createdAt: Schema.DateTimeUtcFromString,
  /** Authenticated URLs (session cookie required). */
  url: Schema.String,
  thumbUrl: Schema.NullOr(Schema.String),
})
export type MediaItem = typeof MediaItem.Type

export const MediaUpload = Schema.Struct({
  kind: MediaKind,
  caption: Schema.optional(Schema.NullOr(Schema.Trim.pipe(Schema.check(Schema.isMaxLength(500))))),
  filename: Schema.Trim.pipe(Schema.check(Schema.isBetweenLength(1, 260))),
  mimeType: Schema.Trim.pipe(Schema.check(Schema.isBetweenLength(3, 100))),
  contentBase64: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
})
export type MediaUpload = typeof MediaUpload.Type

export const MediaCaptionUpdate = Schema.Struct({
  caption: Schema.NullOr(Schema.Trim.pipe(Schema.check(Schema.isMaxLength(500)))),
})
export type MediaCaptionUpdate = typeof MediaCaptionUpdate.Type

export class MediaNotFound extends Schema.TaggedError<MediaNotFound>()(
  "MediaNotFound",
  {},
  { httpApiStatus: 404 },
) {}

export class MediaRejected extends Schema.TaggedError<MediaRejected>()(
  "MediaRejected",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}
