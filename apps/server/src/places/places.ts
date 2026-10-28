import {
  type BulkAction,
  type BulkResult,
  type DeletedPlace,
  type EditableField,
  editableFields,
  ListNotFound,
  type ManualPlaceInput,
  type Place,
  type PlaceCategory,
  PlaceNotFound,
  type PlaceSource,
  type PlaceStatus,
  type PlaceUpdate,
  type SavedPlace,
  type TagRef,
} from "@placard/domain"
import { Clock, Context, DateTime, Duration, Effect, Layer, Option } from "effect"
import { SqlClient } from "effect/sql"
import { v7 as uuidv7 } from "uuid"
import type { GooglePlaceDetails } from "../google/places.ts"
import { emptyFacts, loadFactsMap } from "./facts.ts"
import { applyEdit } from "./overrides.ts"
import { Tags } from "./tags.ts"

export const PURGE_AFTER = Duration.days(30)

export interface PlaceFilter {
  readonly tag?: string | undefined
  readonly list?: string | undefined
  readonly status?: PlaceStatus | undefined
}

interface PlaceRow {
  readonly id: string
  readonly name: string
  readonly category: PlaceCategory
  readonly lat: number
  readonly lng: number
  readonly address: string | null
  readonly google_place_id: string | null
  readonly status: PlaceStatus | null
  readonly notes: string | null
  readonly source: PlaceSource
  readonly manual_fields: ReadonlyArray<string>
  readonly created_at: Date
  readonly deleted_at: Date | null
}

const isEditable = (field: string): field is EditableField =>
  (editableFields as ReadonlyArray<string>).includes(field)

/** A user's places. Every query is scoped to `ownerId`. */
export class Places extends Context.Service<
  Places,
  {
    readonly list: (ownerId: string, filter?: PlaceFilter) => Effect.Effect<ReadonlyArray<Place>>
    readonly get: (ownerId: string, id: string) => Effect.Effect<Place, PlaceNotFound>
    readonly findByGooglePlaceId: (
      ownerId: string,
      googlePlaceId: string,
    ) => Effect.Effect<Option.Option<Place>>
    readonly addFromGoogle: (
      ownerId: string,
      details: GooglePlaceDetails,
      source: Extract<PlaceSource, "autocomplete" | "map_pick" | "takeout">,
      options?: { readonly importRunId?: string },
    ) => Effect.Effect<SavedPlace>
    readonly addManual: (ownerId: string, input: ManualPlaceInput) => Effect.Effect<SavedPlace>
    /** Create a Takeout pin without a Google Place ID (coords required). */
    readonly addFromTakeout: (
      ownerId: string,
      input: {
        readonly name: string
        readonly category: PlaceCategory
        readonly location: { readonly lat: number; readonly lng: number }
        readonly address: string | null
        readonly notes: string | null
        readonly importRunId: string
      },
    ) => Effect.Effect<SavedPlace>
    readonly update: (
      ownerId: string,
      id: string,
      patch: PlaceUpdate,
    ) => Effect.Effect<Place, PlaceNotFound>
    readonly setTags: (
      ownerId: string,
      id: string,
      names: ReadonlyArray<string>,
    ) => Effect.Effect<Place, PlaceNotFound>
    readonly setLists: (
      ownerId: string,
      id: string,
      listIds: ReadonlyArray<string>,
    ) => Effect.Effect<Place, PlaceNotFound | ListNotFound>
    readonly remove: (ownerId: string, id: string) => Effect.Effect<void, PlaceNotFound>
    readonly bulk: (
      ownerId: string,
      placeIds: ReadonlyArray<string>,
      action: BulkAction,
    ) => Effect.Effect<BulkResult, PlaceNotFound | ListNotFound>
    readonly listDeleted: (ownerId: string) => Effect.Effect<ReadonlyArray<DeletedPlace>>
    readonly restore: (
      ownerId: string,
      placeIds: ReadonlyArray<string>,
    ) => Effect.Effect<BulkResult, PlaceNotFound>
    /** Soft-deleted place ids older than {@link PURGE_AFTER} (files should be unlinked first). */
    readonly listExpiredDeleted: Effect.Effect<ReadonlyArray<string>>
    /** Hard-delete rows whose soft-delete is older than {@link PURGE_AFTER}. */
    readonly purgeExpired: Effect.Effect<number>
  }
>()("placard/Places") {
  static readonly layer = Layer.effect(
    Places,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const tags = yield* Tags
      const columns = sql`
        id, name, category,
        st_y(location::geometry) as lat, st_x(location::geometry) as lng,
        address, google_place_id, status, notes, source, manual_fields, created_at, deleted_at`
      const point = (lat: number, lng: number) =>
        sql`st_setsrid(st_makepoint(${lng}, ${lat}), 4326)::geography`
      const alive = (ownerId: string) =>
        sql`owner_id = ${ownerId} and deleted_at is null and location is not null`
      const owned = (ownerId: string) => sql`owner_id = ${ownerId}`

      const loadTags = (placeIds: ReadonlyArray<string>) =>
        placeIds.length === 0
          ? Effect.succeed(new Map<string, TagRef[]>())
          : sql<{ place_id: string; id: string; name: string }>`
              select pt.place_id, t.id, t.name
              from place_tags pt
              join tags t on t.id = pt.tag_id
              where ${sql.in("pt.place_id", placeIds)}
              order by lower(t.name)`.pipe(
              Effect.map((rows) => {
                const map = new Map<string, TagRef[]>()
                for (const row of rows) {
                  const list = map.get(row.place_id) ?? []
                  list.push({ id: row.id, name: row.name })
                  map.set(row.place_id, list)
                }
                return map
              }),
              Effect.orDie,
            )

      const loadListIds = (placeIds: ReadonlyArray<string>) =>
        placeIds.length === 0
          ? Effect.succeed(new Map<string, string[]>())
          : sql<{ place_id: string; list_id: string }>`
              select place_id, list_id from list_items
              where ${sql.in("place_id", placeIds)}
              order by added_at`.pipe(
              Effect.map((rows) => {
                const map = new Map<string, string[]>()
                for (const row of rows) {
                  const list = map.get(row.place_id) ?? []
                  list.push(row.list_id)
                  map.set(row.place_id, list)
                }
                return map
              }),
              Effect.orDie,
            )

      const hydrate = (rows: ReadonlyArray<PlaceRow>) =>
        Effect.gen(function* () {
          const ids = rows.map((row) => row.id)
          const [tagMap, listMap, factsMap] = yield* Effect.all(
            [loadTags(ids), loadListIds(ids), loadFactsMap(sql, ids)],
            { concurrency: 3 },
          )
          return rows.map(
            (row): Place => ({
              id: row.id,
              name: row.name,
              category: row.category,
              location: { lat: row.lat, lng: row.lng },
              address: row.address,
              googlePlaceId: row.google_place_id,
              status: row.status,
              notes: row.notes,
              source: row.source,
              editedFields: row.manual_fields.filter(isEditable),
              tags: tagMap.get(row.id) ?? [],
              listIds: listMap.get(row.id) ?? [],
              facts: factsMap.get(row.id) ?? emptyFacts(),
              createdAt: DateTime.fromDateUnsafe(row.created_at),
            }),
          )
        })

      const one = (ownerId: string, id: string) =>
        sql<PlaceRow>`select ${columns} from places where ${alive(ownerId)} and id = ${id}`.pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows[0] ? hydrate(rows).pipe(Effect.map((places) => places[0]!)) : new PlaceNotFound(),
          ),
        )

      const requireAlive = (ownerId: string, placeIds: ReadonlyArray<string>) =>
        sql<{ id: string }>`
          select id from places
          where ${alive(ownerId)} and ${sql.in("id", placeIds)}`.pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows.length === placeIds.length ? Effect.succeed(placeIds) : new PlaceNotFound(),
          ),
        )

      const requireLists = (ownerId: string, listIds: ReadonlyArray<string>) =>
        listIds.length === 0
          ? Effect.void
          : sql<{ id: string }>`
              select id from lists
              where ${owned(ownerId)} and ${sql.in("id", listIds)}`.pipe(
              Effect.orDie,
              Effect.flatMap((rows) =>
                rows.length === listIds.length ? Effect.void : new ListNotFound(),
              ),
            )

      const softDelete = (ownerId: string, placeIds: ReadonlyArray<string>) =>
        sql`
          update places set deleted_at = now(), updated_at = now()
          where ${alive(ownerId)} and ${sql.in("id", placeIds)}
          returning id`.pipe(
          Effect.map((rows) => rows.length),
          Effect.orDie,
        )

      const findByGooglePlaceId = (ownerId: string, googlePlaceId: string) =>
        sql<PlaceRow>`
          select ${columns} from places
          where ${alive(ownerId)} and google_place_id = ${googlePlaceId}`.pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows[0]
              ? hydrate(rows).pipe(Effect.map((places) => Option.some(places[0]!)))
              : Effect.succeed(Option.none()),
          ),
        )

      return {
        list: (ownerId, filter = {}) =>
          Effect.gen(function* () {
            const clauses = [alive(ownerId)]
            if (filter.status) clauses.push(sql`status = ${filter.status}`)
            if (filter.tag) {
              clauses.push(sql`exists (
                select 1 from place_tags pt
                join tags t on t.id = pt.tag_id
                where pt.place_id = places.id
                  and t.owner_id = ${ownerId}
                  and lower(t.name) = lower(${filter.tag})
              )`)
            }
            if (filter.list) {
              clauses.push(sql`exists (
                select 1 from list_items li
                join lists l on l.id = li.list_id
                where li.place_id = places.id
                  and l.owner_id = ${ownerId}
                  and l.id = ${filter.list}
              )`)
            }
            const rows = yield* sql<PlaceRow>`
              select ${columns} from places
              where ${sql.and(clauses)}
              order by created_at desc`.pipe(Effect.orDie)
            return yield* hydrate(rows)
          }),

        get: one,

        findByGooglePlaceId,

        addFromGoogle: Effect.fn("Places.addFromGoogle")(
          function* (ownerId, details, source, options) {
            const importRunId = options?.importRunId ?? null
            const inserted = yield* sql<PlaceRow>`
            insert into places (
              id, owner_id, name, category, location, address, google_place_id,
              utc_offset_minutes, source, import_run_id, last_enriched_at
            ) values (
              ${uuidv7()}, ${ownerId}, ${details.name}, ${details.category},
              ${point(details.location.lat, details.location.lng)}, ${details.address},
              ${details.googlePlaceId}, ${details.utcOffsetMinutes}, ${source},
              ${importRunId}, now()
            )
            on conflict (owner_id, google_place_id)
              where google_place_id is not null and deleted_at is null
              do nothing
            returning ${columns}`.pipe(Effect.orDie)
            if (inserted[0]) {
              const [place] = yield* hydrate(inserted)
              return { place: place!, created: true }
            }
            const existing = yield* findByGooglePlaceId(ownerId, details.googlePlaceId)
            return Option.isSome(existing)
              ? { place: existing.value, created: false }
              : yield* Effect.die(`place ${details.googlePlaceId} conflicted but was not found`)
          },
        ),

        addManual: (ownerId, input) =>
          sql<PlaceRow>`
            insert into places (id, owner_id, name, category, location, address, source, manual_fields)
            values (
              ${uuidv7()}, ${ownerId}, ${input.name}, ${input.category},
              ${point(input.location.lat, input.location.lng)}, ${input.address || null},
              'manual', ${["name", "category", "address"]}
            )
            returning ${columns}`.pipe(
            Effect.orDie,
            Effect.flatMap(hydrate),
            Effect.map((places) => ({ place: places[0]!, created: true })),
          ),

        addFromTakeout: (ownerId, input) =>
          sql<PlaceRow>`
            insert into places (
              id, owner_id, name, category, location, address, notes, source, import_run_id, manual_fields
            ) values (
              ${uuidv7()}, ${ownerId}, ${input.name}, ${input.category},
              ${point(input.location.lat, input.location.lng)}, ${input.address},
              ${input.notes}, 'takeout', ${input.importRunId}, ${["name", "category", "address"]}
            )
            returning ${columns}`.pipe(
            Effect.orDie,
            Effect.flatMap(hydrate),
            Effect.map((places) => ({ place: places[0]!, created: true })),
          ),

        update: Effect.fn("Places.update")(function* (ownerId, id, patch) {
          const current = yield* one(ownerId, id)
          const edited = applyEdit(
            {
              values: {
                name: current.name,
                category: current.category,
                address: current.address,
              },
              manual: current.editedFields,
            },
            {
              ...(patch.name !== undefined ? { name: patch.name } : {}),
              ...(patch.category !== undefined ? { category: patch.category } : {}),
              ...(patch.address !== undefined ? { address: patch.address } : {}),
            },
          )
          const notes = patch.notes !== undefined ? patch.notes || null : current.notes
          const status = patch.status !== undefined ? patch.status : current.status
          yield* sql`
            update places set
              name = ${edited.values.name},
              category = ${edited.values.category},
              address = ${edited.values.address},
              notes = ${notes},
              status = ${status},
              manual_fields = ${edited.manual},
              updated_at = now()
            where ${alive(ownerId)} and id = ${id}`.pipe(Effect.orDie)
          return yield* one(ownerId, id)
        }),

        setTags: Effect.fn("Places.setTags")(function* (ownerId, id, names) {
          yield* one(ownerId, id)
          const resolved = yield* Effect.forEach(names, (name) => tags.ensure(ownerId, name), {
            concurrency: 1,
          })
          yield* sql
            .withTransaction(
              Effect.gen(function* () {
                yield* sql`delete from place_tags where place_id = ${id}`
                if (resolved.length === 0) return
                yield* sql`insert into place_tags ${sql.insert(
                  resolved.map((tag) => ({ place_id: id, tag_id: tag.id })),
                )}`
              }),
            )
            .pipe(Effect.orDie)
          return yield* one(ownerId, id)
        }),

        setLists: Effect.fn("Places.setLists")(function* (ownerId, id, listIds) {
          yield* one(ownerId, id)
          yield* requireLists(ownerId, listIds)
          yield* sql
            .withTransaction(
              Effect.gen(function* () {
                yield* sql`delete from list_items where place_id = ${id}`
                if (listIds.length === 0) return
                yield* sql`insert into list_items ${sql.insert(
                  listIds.map((listId) => ({ list_id: listId, place_id: id })),
                )}`
              }),
            )
            .pipe(Effect.orDie)
          return yield* one(ownerId, id)
        }),

        remove: (ownerId, id) =>
          softDelete(ownerId, [id]).pipe(
            Effect.flatMap((n) => (n > 0 ? Effect.void : new PlaceNotFound())),
          ),

        bulk: Effect.fn("Places.bulk")(function* (ownerId, placeIds, action) {
          yield* requireAlive(ownerId, placeIds)
          if (action._tag === "addToList" || action._tag === "removeFromList") {
            yield* requireLists(ownerId, [action.listId])
          }
          if (action._tag === "addTag") {
            const tag = yield* tags.ensure(ownerId, action.tagName)
            yield* sql`
              insert into place_tags ${sql.insert(
                placeIds.map((placeId) => ({ place_id: placeId, tag_id: tag.id })),
              )}
              on conflict do nothing`.pipe(Effect.orDie)
            return { affected: placeIds.length }
          }
          if (action._tag === "removeTag") {
            const removed = yield* sql`
              delete from place_tags
              where tag_id = ${action.tagId}
                and ${sql.in("place_id", placeIds)}
                and exists (
                  select 1 from tags t
                  where t.id = place_tags.tag_id and t.owner_id = ${ownerId}
                )
              returning place_id`.pipe(Effect.orDie)
            return { affected: new Set(removed.map((r) => r.place_id)).size }
          }
          if (action._tag === "addToList") {
            yield* sql`
              insert into list_items ${sql.insert(
                placeIds.map((placeId) => ({ list_id: action.listId, place_id: placeId })),
              )}
              on conflict do nothing`.pipe(Effect.orDie)
            return { affected: placeIds.length }
          }
          if (action._tag === "removeFromList") {
            const removed = yield* sql`
              delete from list_items
              where list_id = ${action.listId} and ${sql.in("place_id", placeIds)}
              returning place_id`.pipe(Effect.orDie)
            return { affected: removed.length }
          }
          if (action._tag === "setStatus") {
            yield* sql`
              update places set status = ${action.status}, updated_at = now()
              where ${alive(ownerId)} and ${sql.in("id", placeIds)}`.pipe(Effect.orDie)
            return { affected: placeIds.length }
          }
          return { affected: yield* softDelete(ownerId, placeIds) }
        }),

        listDeleted: (ownerId) =>
          Effect.gen(function* () {
            const rows = yield* sql<PlaceRow>`
              select ${columns} from places
              where ${owned(ownerId)} and deleted_at is not null and location is not null
              order by deleted_at desc`.pipe(Effect.orDie)
            const places = yield* hydrate(rows)
            return places.flatMap((place, index): DeletedPlace[] => {
              const deleted = rows[index]?.deleted_at
              if (!deleted) return []
              const deletedAt = DateTime.fromDateUnsafe(deleted)
              return [
                {
                  place,
                  deletedAt,
                  purgeAt: DateTime.addDuration(deletedAt, PURGE_AFTER),
                },
              ]
            })
          }),

        restore: Effect.fn("Places.restore")(function* (ownerId, placeIds) {
          const restored = yield* sql`
            update places set deleted_at = null, updated_at = now()
            where ${owned(ownerId)} and deleted_at is not null and ${sql.in("id", placeIds)}
            returning id`.pipe(Effect.orDie)
          if (restored.length !== placeIds.length) return yield* new PlaceNotFound()
          return { affected: restored.length }
        }),

        listExpiredDeleted: Effect.gen(function* () {
          const cutoff = new Date((yield* Clock.currentTimeMillis) - Duration.toMillis(PURGE_AFTER))
          return yield* sql<{ id: string }>`
            select id from places
            where deleted_at is not null and deleted_at < ${cutoff}`.pipe(
            Effect.map((rows) => rows.map((row) => row.id)),
            Effect.orDie,
          )
        }),

        purgeExpired: Effect.gen(function* () {
          const cutoff = new Date((yield* Clock.currentTimeMillis) - Duration.toMillis(PURGE_AFTER))
          return yield* sql`
            delete from places
            where deleted_at is not null and deleted_at < ${cutoff}
            returning id`.pipe(
            Effect.map((rows) => rows.length),
            Effect.orDie,
          )
        }),
      }
    }),
  )
}
