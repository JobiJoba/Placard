import { mkdir, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  type MediaItem,
  type MediaKind,
  MediaNotFound,
  MediaRejected,
  type MediaUpload,
  type PlaceNotFound,
} from "@placard/domain"
import { Context, DateTime, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import sharp from "sharp"
import { v7 as uuidv7 } from "uuid"
import { AppConfig } from "../config.ts"
import { Places } from "../places/places.ts"

const MAX_BYTES = 15 * 1024 * 1024
const THUMB_EDGE = 480
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"])

interface MediaRow {
  readonly id: string
  readonly place_id: string
  readonly kind: MediaKind
  readonly path: string
  readonly thumb_path: string | null
  readonly mime_type: string
  readonly bytes: number
  readonly width: number | null
  readonly height: number | null
  readonly caption: string | null
  readonly taken_at: Date | null
  readonly created_at: Date
}

const extFor = (mime: string): string => {
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  return "jpg"
}

const toItem = (row: MediaRow): MediaItem => ({
  id: row.id,
  placeId: row.place_id,
  kind: row.kind,
  mimeType: row.mime_type,
  bytes: row.bytes,
  width: row.width,
  height: row.height,
  caption: row.caption,
  takenAt: row.taken_at ? DateTime.fromDateUnsafe(row.taken_at) : null,
  createdAt: DateTime.fromDateUnsafe(row.created_at),
  url: `/api/media/${row.id}/file`,
  thumbUrl: row.thumb_path ? `/api/media/${row.id}/thumb` : null,
})

/** Place media: dish photos, general photos, attachments. Files live under MEDIA_DIR. */
export class Media extends Context.Service<
  Media,
  {
    readonly list: (
      ownerId: string,
      placeId: string,
    ) => Effect.Effect<ReadonlyArray<MediaItem>, PlaceNotFound>
    readonly upload: (
      ownerId: string,
      placeId: string,
      input: MediaUpload,
    ) => Effect.Effect<MediaItem, PlaceNotFound | MediaRejected>
    readonly updateCaption: (
      ownerId: string,
      id: string,
      caption: string | null,
    ) => Effect.Effect<MediaItem, MediaNotFound>
    readonly remove: (ownerId: string, id: string) => Effect.Effect<void, MediaNotFound>
    /** Absolute paths for authenticated file serving. */
    readonly resolveFile: (
      ownerId: string,
      id: string,
      which: "file" | "thumb",
    ) => Effect.Effect<{ readonly absolutePath: string; readonly mimeType: string }, MediaNotFound>
    /** Unlink files for places about to be hard-deleted (call before cascade). */
    readonly unlinkForPlaces: (placeIds: ReadonlyArray<string>) => Effect.Effect<void>
  }
>()("placard/Media") {
  static readonly layer = Layer.effect(
    Media,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const places = yield* Places
      const config = yield* AppConfig
      const root = config.mediaDir

      const columns = sql`
        id, place_id, kind, path, thumb_path, mime_type, bytes, width, height,
        caption, taken_at, created_at`

      const abs = (relative: string) => join(root, relative)

      const unlinkQuiet = (relative: string | null): Effect.Effect<void> =>
        relative
          ? Effect.promise(() => unlink(abs(relative)).catch(() => undefined)).pipe(Effect.asVoid)
          : Effect.void

      const requirePlace = (ownerId: string, placeId: string) =>
        places.get(ownerId, placeId).pipe(Effect.asVoid)

      return Media.of({
        list: Effect.fn("Media.list")(function* (ownerId, placeId) {
          yield* requirePlace(ownerId, placeId)
          const rows = yield* sql<MediaRow>`
            select ${columns} from media
            where owner_id = ${ownerId} and place_id = ${placeId}
            order by created_at desc, id desc`.pipe(Effect.orDie)
          return rows.map(toItem)
        }),

        upload: Effect.fn("Media.upload")(function* (ownerId, placeId, input) {
          yield* requirePlace(ownerId, placeId)

          const mime = input.mimeType.toLowerCase()
          if (!ALLOWED_MIME.has(mime)) {
            return yield* new MediaRejected({
              message: "Only JPEG, PNG, and WebP images are supported.",
            })
          }

          const bytes = Buffer.from(input.contentBase64, "base64")
          if (bytes.byteLength === 0) {
            return yield* new MediaRejected({ message: "Image is empty." })
          }
          if (bytes.byteLength > MAX_BYTES) {
            return yield* new MediaRejected({
              message: `Image is too large (max ${MAX_BYTES / (1024 * 1024)} MB).`,
            })
          }

          const id = uuidv7()
          const relative = `${ownerId}/${placeId}/${id}.${extFor(mime)}`
          const thumbRelative = `${ownerId}/${placeId}/${id}.thumb.jpg`
          const absolute = abs(relative)
          const thumbAbsolute = abs(thumbRelative)

          const reject = (fallback: string) => (cause: unknown) =>
            new MediaRejected({
              message: cause instanceof Error ? cause.message : fallback,
            })

          const cleanup = unlinkQuiet(relative).pipe(
            Effect.andThen(() => unlinkQuiet(thumbRelative)),
          )

          const written = yield* Effect.gen(function* () {
            yield* Effect.tryPromise({
              try: () => mkdir(dirname(absolute), { recursive: true }),
              catch: reject("Could not create media folder."),
            })
            const meta = yield* Effect.tryPromise({
              try: () => sharp(bytes, { failOn: "truncated" }).metadata(),
              catch: reject("Could not read image."),
            })
            yield* Effect.tryPromise({
              try: () => writeFile(absolute, bytes),
              catch: reject("Could not save image."),
            })
            yield* Effect.tryPromise({
              try: () =>
                sharp(bytes)
                  .rotate()
                  .resize({
                    width: THUMB_EDGE,
                    height: THUMB_EDGE,
                    fit: "inside",
                    withoutEnlargement: true,
                  })
                  .jpeg({ quality: 80, mozjpeg: true })
                  .toFile(thumbAbsolute),
              catch: reject("Could not create thumbnail."),
            })
            return {
              width: meta.width ?? null,
              height: meta.height ?? null,
            }
          }).pipe(Effect.tapError(() => cleanup))

          const caption = input.caption === undefined ? null : input.caption
          const rows = yield* sql<MediaRow>`
            insert into media (
              id, owner_id, place_id, kind, path, thumb_path, mime_type, bytes,
              width, height, caption
            ) values (
              ${id}, ${ownerId}, ${placeId}, ${input.kind}, ${relative},
              ${thumbRelative}, ${mime}, ${bytes.byteLength},
              ${written.width}, ${written.height}, ${caption}
            )
            returning ${columns}`.pipe(Effect.orDie)
          const row = rows[0]
          if (!row) return yield* new MediaRejected({ message: "Could not save media record." })
          return toItem(row)
        }),

        updateCaption: Effect.fn("Media.updateCaption")(function* (ownerId, id, caption) {
          const rows = yield* sql<MediaRow>`
            update media set caption = ${caption}
            where id = ${id} and owner_id = ${ownerId}
            returning ${columns}`.pipe(Effect.orDie)
          const row = rows[0]
          if (!row) return yield* new MediaNotFound()
          return toItem(row)
        }),

        remove: Effect.fn("Media.remove")(function* (ownerId, id) {
          const rows = yield* sql<{ path: string; thumb_path: string | null }>`
            delete from media
            where id = ${id} and owner_id = ${ownerId}
            returning path, thumb_path`.pipe(Effect.orDie)
          const row = rows[0]
          if (!row) return yield* new MediaNotFound()
          yield* unlinkQuiet(row.path)
          yield* unlinkQuiet(row.thumb_path)
        }),

        resolveFile: Effect.fn("Media.resolveFile")(function* (ownerId, id, which) {
          const rows = yield* sql<{
            path: string
            thumb_path: string | null
            mime_type: string
          }>`
            select path, thumb_path, mime_type from media
            where id = ${id} and owner_id = ${ownerId}`.pipe(Effect.orDie)
          const row = rows[0]
          if (!row) return yield* new MediaNotFound()
          if (which === "thumb") {
            if (!row.thumb_path) return yield* new MediaNotFound()
            return { absolutePath: abs(row.thumb_path), mimeType: "image/jpeg" }
          }
          return { absolutePath: abs(row.path), mimeType: row.mime_type }
        }),

        unlinkForPlaces: Effect.fn("Media.unlinkForPlaces")(function* (placeIds) {
          if (placeIds.length === 0) return
          const rows = yield* sql<{ path: string; thumb_path: string | null }>`
            select path, thumb_path from media
            where ${sql.in("place_id", placeIds)}`.pipe(Effect.orDie)
          yield* Effect.forEach(
            rows,
            (row) => unlinkQuiet(row.path).pipe(Effect.andThen(() => unlinkQuiet(row.thumb_path))),
            { concurrency: 8, discard: true },
          )
        }),
      })
    }),
  )
}
