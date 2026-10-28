import { mkdir, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  type MediaItem,
  type MediaKind,
  MediaNotFound,
  type MediaOrigin,
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
const COVER_EDGE = 1200
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"])

interface MediaRow {
  readonly id: string
  readonly place_id: string
  readonly kind: MediaKind
  readonly origin: MediaOrigin
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

const sniffMime = (bytes: Uint8Array): string | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png"
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp"
  }
  return null
}

const toItem = (row: MediaRow, coverMediaId: string | null): MediaItem => ({
  id: row.id,
  placeId: row.place_id,
  kind: row.kind,
  origin: row.origin,
  mimeType: row.mime_type,
  bytes: row.bytes,
  width: row.width,
  height: row.height,
  caption: row.caption,
  takenAt: row.taken_at ? DateTime.fromDateUnsafe(row.taken_at) : null,
  createdAt: DateTime.fromDateUnsafe(row.created_at),
  isCover: coverMediaId === row.id,
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
    readonly setCover: (
      ownerId: string,
      id: string,
    ) => Effect.Effect<MediaItem, MediaNotFound | PlaceNotFound>
    readonly remove: (ownerId: string, id: string) => Effect.Effect<void, MediaNotFound>
    /**
     * Store or refresh the Google cover photo when the place has no user-chosen cover.
     * No-ops when a user media is already the cover.
     */
    readonly syncGoogleCover: (
      ownerId: string,
      placeId: string,
      bytes: Uint8Array,
    ) => Effect.Effect<void, PlaceNotFound | MediaRejected>
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
        id, place_id, kind, origin, path, thumb_path, mime_type, bytes, width, height,
        caption, taken_at, created_at`

      const abs = (relative: string) => join(root, relative)

      const unlinkQuiet = (relative: string | null): Effect.Effect<void> =>
        relative
          ? Effect.promise(() => unlink(abs(relative)).catch(() => undefined)).pipe(Effect.asVoid)
          : Effect.void

      const requirePlace = (ownerId: string, placeId: string) =>
        places.get(ownerId, placeId).pipe(Effect.asVoid)

      const coverIdFor = (ownerId: string, placeId: string) =>
        sql<{ cover_media_id: string | null }>`
          select cover_media_id from places
          where id = ${placeId} and owner_id = ${ownerId}`.pipe(
          Effect.map((rows) => rows[0]?.cover_media_id ?? null),
          Effect.orDie,
        )

      const setCoverId = (ownerId: string, placeId: string, mediaId: string | null) =>
        sql`
          update places set cover_media_id = ${mediaId}, updated_at = now()
          where id = ${placeId} and owner_id = ${ownerId}`.pipe(Effect.orDie, Effect.asVoid)

      const coverIsUser = (ownerId: string, placeId: string) =>
        sql<{ origin: MediaOrigin }>`
          select m.origin from places p
          join media m on m.id = p.cover_media_id
          where p.id = ${placeId} and p.owner_id = ${ownerId}`.pipe(
          Effect.map((rows) => rows[0]?.origin === "user"),
          Effect.orDie,
        )

      const reassignCover = (ownerId: string, placeId: string) =>
        Effect.gen(function* () {
          const next = yield* sql<{ id: string }>`
            select id from media
            where owner_id = ${ownerId} and place_id = ${placeId}
            order by
              case when origin = 'user' then 0 else 1 end,
              created_at desc, id desc
            limit 1`.pipe(Effect.orDie)
          yield* setCoverId(ownerId, placeId, next[0]?.id ?? null)
        })

      const writeImageFiles = (
        ownerId: string,
        placeId: string,
        id: string,
        bytes: Buffer,
        mime: string,
      ) =>
        Effect.gen(function* () {
          const reject = (fallback: string) => (cause: unknown) =>
            new MediaRejected({
              message: cause instanceof Error ? cause.message : fallback,
            })
          const thumbRelative = `${ownerId}/${placeId}/${id}.thumb.jpg`
          const thumbAbsolute = abs(thumbRelative)

          const meta = yield* Effect.tryPromise({
            try: () => sharp(bytes, { failOn: "truncated" }).metadata(),
            catch: reject("Could not read image."),
          })
          const needsDownscale =
            (meta.width != null && meta.width > COVER_EDGE) ||
            (meta.height != null && meta.height > COVER_EDGE)
          const storedMime = needsDownscale ? "image/jpeg" : mime
          const relative = `${ownerId}/${placeId}/${id}.${extFor(storedMime)}`
          const absolute = abs(relative)
          const cleanup = unlinkQuiet(relative).pipe(
            Effect.andThen(() => unlinkQuiet(thumbRelative)),
          )

          yield* Effect.gen(function* () {
            yield* Effect.tryPromise({
              try: () => mkdir(dirname(absolute), { recursive: true }),
              catch: reject("Could not create media folder."),
            })
            if (needsDownscale) {
              yield* Effect.tryPromise({
                try: () =>
                  sharp(bytes)
                    .rotate()
                    .resize({
                      width: COVER_EDGE,
                      height: COVER_EDGE,
                      fit: "inside",
                      withoutEnlargement: true,
                    })
                    .jpeg({ quality: 85, mozjpeg: true })
                    .toFile(absolute),
                catch: reject("Could not save image."),
              })
            } else {
              yield* Effect.tryPromise({
                try: () => writeFile(absolute, bytes),
                catch: reject("Could not save image."),
              })
            }
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
          }).pipe(Effect.tapError(() => cleanup))

          return {
            width: meta.width ?? null,
            height: meta.height ?? null,
            relative,
            thumbRelative,
            mime: storedMime,
          }
        })

      return Media.of({
        list: Effect.fn("Media.list")(function* (ownerId, placeId) {
          yield* requirePlace(ownerId, placeId)
          const coverMediaId = yield* coverIdFor(ownerId, placeId)
          const rows = yield* sql<MediaRow>`
            select ${columns} from media
            where owner_id = ${ownerId} and place_id = ${placeId}
            order by created_at desc, id desc`.pipe(Effect.orDie)
          return rows.map((row) => toItem(row, coverMediaId))
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
          const written = yield* writeImageFiles(ownerId, placeId, id, bytes, mime)
          const caption = input.caption === undefined ? null : input.caption
          const rows = yield* sql<MediaRow>`
            insert into media (
              id, owner_id, place_id, kind, origin, path, thumb_path, mime_type, bytes,
              width, height, caption
            ) values (
              ${id}, ${ownerId}, ${placeId}, ${input.kind}, 'user', ${written.relative},
              ${written.thumbRelative}, ${written.mime}, ${bytes.byteLength},
              ${written.width}, ${written.height}, ${caption}
            )
            returning ${columns}`.pipe(Effect.orDie)
          const row = rows[0]
          if (!row) return yield* new MediaRejected({ message: "Could not save media record." })

          const userCover = yield* coverIsUser(ownerId, placeId)
          if (!userCover) yield* setCoverId(ownerId, placeId, id)

          const coverMediaId = yield* coverIdFor(ownerId, placeId)
          return toItem(row, coverMediaId)
        }),

        updateCaption: Effect.fn("Media.updateCaption")(function* (ownerId, id, caption) {
          const rows = yield* sql<MediaRow>`
            update media set caption = ${caption}
            where id = ${id} and owner_id = ${ownerId}
            returning ${columns}`.pipe(Effect.orDie)
          const row = rows[0]
          if (!row) return yield* new MediaNotFound()
          const coverMediaId = yield* coverIdFor(ownerId, row.place_id)
          return toItem(row, coverMediaId)
        }),

        setCover: Effect.fn("Media.setCover")(function* (ownerId, id) {
          const rows = yield* sql<MediaRow>`
            select ${columns} from media
            where id = ${id} and owner_id = ${ownerId}`.pipe(Effect.orDie)
          const row = rows[0]
          if (!row) return yield* new MediaNotFound()
          yield* requirePlace(ownerId, row.place_id)
          yield* setCoverId(ownerId, row.place_id, id)
          return toItem(row, id)
        }),

        remove: Effect.fn("Media.remove")(function* (ownerId, id) {
          const before = yield* sql<MediaRow>`
            select ${columns} from media
            where id = ${id} and owner_id = ${ownerId}`.pipe(Effect.orDie)
          const existing = before[0]
          if (!existing) return yield* new MediaNotFound()

          const rows = yield* sql<{ path: string; thumb_path: string | null }>`
            delete from media
            where id = ${id} and owner_id = ${ownerId}
            returning path, thumb_path`.pipe(Effect.orDie)
          const row = rows[0]
          if (!row) return yield* new MediaNotFound()
          yield* unlinkQuiet(row.path)
          yield* unlinkQuiet(row.thumb_path)

          const coverMediaId = yield* coverIdFor(ownerId, existing.place_id)
          if (coverMediaId === null) {
            yield* reassignCover(ownerId, existing.place_id)
          }
        }),

        syncGoogleCover: Effect.fn("Media.syncGoogleCover")(function* (ownerId, placeId, raw) {
          yield* requirePlace(ownerId, placeId)
          if (yield* coverIsUser(ownerId, placeId)) return

          const mime = sniffMime(raw) ?? "image/jpeg"
          if (!ALLOWED_MIME.has(mime)) {
            return yield* new MediaRejected({
              message: "Google returned an unsupported image type.",
            })
          }
          if (raw.byteLength > MAX_BYTES) {
            return yield* new MediaRejected({ message: "Google photo is too large." })
          }

          const bytes = Buffer.from(raw)
          const old = yield* sql<{ id: string; path: string; thumb_path: string | null }>`
            select id, path, thumb_path from media
            where place_id = ${placeId} and owner_id = ${ownerId} and origin = 'google'`.pipe(
            Effect.orDie,
          )
          for (const row of old) {
            yield* sql`delete from media where id = ${row.id}`.pipe(Effect.orDie)
            yield* unlinkQuiet(row.path)
            yield* unlinkQuiet(row.thumb_path)
          }

          const id = uuidv7()
          const written = yield* writeImageFiles(ownerId, placeId, id, bytes, mime)
          yield* sql`
            insert into media (
              id, owner_id, place_id, kind, origin, path, thumb_path, mime_type, bytes,
              width, height, caption
            ) values (
              ${id}, ${ownerId}, ${placeId}, 'photo', 'google', ${written.relative},
              ${written.thumbRelative}, ${written.mime}, ${bytes.byteLength},
              ${written.width}, ${written.height}, null
            )`.pipe(Effect.orDie)
          yield* setCoverId(ownerId, placeId, id)
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
