import { readFile } from "node:fs/promises"
import { extname, join } from "node:path"
import {
  type ExportDocument,
  type ExportMediaEntry,
  exportFormatVersion,
  type Me,
} from "@placard/domain"
import { Context, DateTime, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { zipSync } from "fflate"
import { AppConfig } from "../config.ts"
import { Lists } from "../places/lists.ts"
import { Places } from "../places/places.ts"
import { Tags } from "../places/tags.ts"

interface MediaRow {
  readonly id: string
  readonly place_id: string
  readonly kind: string
  readonly origin: string
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

const iso = (dt: DateTime.Utc) => DateTime.toDateUtc(dt).toISOString()

const extFor = (mime: string, fallbackPath: string): string => {
  const fromPath = extname(fallbackPath).replace(/^\./, "")
  if (fromPath) return fromPath
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  if (mime === "image/jpeg") return "jpg"
  return "bin"
}

const readQuiet = (absolute: string): Effect.Effect<Uint8Array | null> =>
  Effect.promise(() =>
    readFile(absolute)
      .then((buf) => new Uint8Array(buf))
      .catch(() => null),
  )

export class LibraryExport extends Context.Service<
  LibraryExport,
  {
    /** Build a zip of the owner's library (JSON + GeoJSON + media files). */
    readonly buildZip: (owner: Me) => Effect.Effect<Uint8Array>
  }
>()("placard/LibraryExport") {
  static readonly layer = Layer.effect(
    LibraryExport,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const places = yield* Places
      const lists = yield* Lists
      const tags = yield* Tags
      const config = yield* AppConfig
      const mediaRoot = config.mediaDir

      return LibraryExport.of({
        buildZip: (owner) =>
          Effect.gen(function* () {
            const placeRows = yield* places.list(owner.id)
            const listRows = yield* lists.list(owner.id)
            const tagRows = yield* tags.list(owner.id)

            const mediaRows = yield* sql<MediaRow>`
              select m.id, m.place_id, m.kind, m.origin, m.path, m.thumb_path, m.mime_type,
                     m.bytes, m.width, m.height, m.caption, m.taken_at, m.created_at
              from media m
              join places p on p.id = m.place_id
              where p.owner_id = ${owner.id} and p.deleted_at is null
              order by m.created_at`.pipe(Effect.orDie)

            const files: Record<string, Uint8Array> = {}
            const mediaEntries: ExportMediaEntry[] = []

            for (const row of mediaRows) {
              const ext = extFor(row.mime_type, row.path)
              const relPath = `media/${row.id}.${ext}`
              const bytes = yield* readQuiet(join(mediaRoot, row.path))
              if (bytes) files[relPath] = bytes

              let thumbPath: string | null = null
              if (row.thumb_path) {
                const thumbExt = extFor(row.mime_type, row.thumb_path)
                thumbPath = `media/${row.id}.thumb.${thumbExt}`
                const thumbBytes = yield* readQuiet(join(mediaRoot, row.thumb_path))
                if (thumbBytes) files[thumbPath] = thumbBytes
                else thumbPath = null
              }

              mediaEntries.push({
                id: row.id,
                placeId: row.place_id,
                kind: row.kind,
                origin: row.origin,
                mimeType: row.mime_type,
                bytes: row.bytes,
                width: row.width,
                height: row.height,
                caption: row.caption,
                takenAt: row.taken_at ? row.taken_at.toISOString() : null,
                createdAt: row.created_at.toISOString(),
                path: relPath,
                thumbPath,
              })
            }

            const listMembership = yield* sql<{ list_id: string; place_id: string }>`
              select li.list_id, li.place_id
              from list_items li
              join lists l on l.id = li.list_id
              join places p on p.id = li.place_id
              where l.owner_id = ${owner.id} and p.deleted_at is null`.pipe(Effect.orDie)

            const placeIdsByList = new Map<string, string[]>()
            for (const row of listMembership) {
              const cur = placeIdsByList.get(row.list_id) ?? []
              cur.push(row.place_id)
              placeIdsByList.set(row.list_id, cur)
            }

            const document: ExportDocument = {
              version: exportFormatVersion,
              exportedAt: new Date().toISOString(),
              owner: { id: owner.id, name: owner.name, email: owner.email },
              places: placeRows.map((place) => ({
                id: place.id,
                name: place.name,
                category: place.category,
                location: place.location,
                address: place.address,
                googlePlaceId: place.googlePlaceId,
                status: place.status,
                notes: place.notes,
                source: place.source,
                editedFields: [...place.editedFields],
                tagIds: place.tags.map((t) => t.id),
                listIds: [...place.listIds],
                facts: place.facts,
                customFields: [...place.customFields],
                coverMediaId: place.coverMediaId,
                createdAt: iso(place.createdAt),
              })),
              lists: listRows.map((list) => ({
                id: list.id,
                name: list.name,
                description: list.description,
                placeIds: placeIdsByList.get(list.id) ?? [],
                createdAt: iso(list.createdAt),
              })),
              tags: tagRows.map((tag) => ({ id: tag.id, name: tag.name })),
              media: mediaEntries,
            }

            const geojson = {
              type: "FeatureCollection" as const,
              features: placeRows.map((place) => ({
                type: "Feature" as const,
                geometry: {
                  type: "Point" as const,
                  coordinates: [place.location.lng, place.location.lat],
                },
                properties: {
                  id: place.id,
                  name: place.name,
                  category: place.category,
                  status: place.status,
                  address: place.address,
                  googlePlaceId: place.googlePlaceId,
                },
              })),
            }

            const encoder = new TextEncoder()
            files["placard.json"] = encoder.encode(`${JSON.stringify(document, null, 2)}\n`)
            files["library.geojson"] = encoder.encode(`${JSON.stringify(geojson, null, 2)}\n`)
            files["media/manifest.json"] = encoder.encode(
              `${JSON.stringify(
                {
                  version: exportFormatVersion,
                  items: mediaEntries.map((m) => ({
                    id: m.id,
                    placeId: m.placeId,
                    kind: m.kind,
                    mimeType: m.mimeType,
                    path: m.path,
                    thumbPath: m.thumbPath,
                  })),
                },
                null,
                2,
              )}\n`,
            )

            return zipSync(files, { level: 6 })
          }),
      })
    }),
  )
}
