import {
  type BulkAction,
  type BulkResult,
  type CopyIntoHouseholdInput,
  type CustomFieldCreate,
  type CustomFieldInvalid,
  type CustomFieldNotFound,
  type CustomFieldUpdate,
  type DeletedPlace,
  type EditableField,
  editableFields,
  HouseholdDisabled,
  HouseholdPlaceConflict,
  ListNotFound,
  type ManualPlaceInput,
  type Place,
  type PlaceCategory,
  PlaceNotFound,
  type PlaceSource,
  type PlaceStatus,
  type PlaceUpdate,
  type PlaceVisibility,
  type SavedPlace,
  type TagRef,
} from "@placard/domain"
import { Clock, Context, DateTime, Duration, Effect, Layer, Option } from "effect"
import { SqlClient } from "effect/sql"
import { v7 as uuidv7 } from "uuid"
import type { GooglePlaceDetails } from "../google/places.ts"
import {
  createCustomField,
  loadCustomFieldsMap,
  removeCustomField,
  updateCustomField,
} from "./custom-fields.ts"
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
  readonly visibility: PlaceVisibility
  readonly owner_id: string
  readonly owner_name: string
  readonly manual_fields: ReadonlyArray<string>
  readonly cover_media_id: string | null
  readonly created_at: Date
  readonly deleted_at: Date | null
}

const coverThumbUrl = (coverMediaId: string | null, thumbPath: string | null) =>
  coverMediaId && thumbPath
    ? `/api/media/${coverMediaId}/thumb`
    : coverMediaId
      ? `/api/media/${coverMediaId}/file`
      : null

const isEditable = (field: string): field is EditableField =>
  (editableFields as ReadonlyArray<string>).includes(field)

/** Places library. Reads honor household visibility; mutations stay owner-scoped. */
export class Places extends Context.Service<
  Places,
  {
    readonly list: (
      actorId: string,
      householdEnabled: boolean,
      filter?: PlaceFilter,
    ) => Effect.Effect<ReadonlyArray<Place>>
    readonly get: (
      actorId: string,
      id: string,
      householdEnabled: boolean,
    ) => Effect.Effect<Place, PlaceNotFound>
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
    readonly addManual: (
      ownerId: string,
      input: ManualPlaceInput,
      options?: { readonly source?: Extract<PlaceSource, "manual" | "mcp"> },
    ) => Effect.Effect<SavedPlace>
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
    readonly addCustomField: (
      ownerId: string,
      placeId: string,
      input: CustomFieldCreate,
    ) => Effect.Effect<Place, PlaceNotFound | CustomFieldInvalid>
    readonly updateCustomField: (
      ownerId: string,
      placeId: string,
      fieldId: string,
      patch: CustomFieldUpdate,
    ) => Effect.Effect<Place, PlaceNotFound | CustomFieldNotFound | CustomFieldInvalid>
    readonly removeCustomField: (
      ownerId: string,
      placeId: string,
      fieldId: string,
    ) => Effect.Effect<Place, PlaceNotFound | CustomFieldNotFound>
    readonly setVisibility: (
      ownerId: string,
      id: string,
      visibility: PlaceVisibility,
      householdEnabled: boolean,
    ) => Effect.Effect<Place, PlaceNotFound | HouseholdDisabled | HouseholdPlaceConflict>
    readonly copyInto: (
      ownerId: string,
      sourceId: string,
      targetId: string,
      input: CopyIntoHouseholdInput,
      householdEnabled: boolean,
    ) => Effect.Effect<Place, PlaceNotFound | HouseholdDisabled | CustomFieldInvalid>
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
        places.id, places.name, places.category,
        st_y(places.location::geometry) as lat, st_x(places.location::geometry) as lng,
        places.address, places.google_place_id, places.status, places.notes, places.source,
        places.visibility, places.owner_id, u.name as owner_name,
        places.manual_fields, places.cover_media_id,
        places.created_at, places.deleted_at`
      const fromPlaces = sql`places join users u on u.id = places.owner_id`
      const point = (lat: number, lng: number) =>
        sql`st_setsrid(st_makepoint(${lng}, ${lat}), 4326)::geography`
      const ownedAlive = (ownerId: string) =>
        sql`places.owner_id = ${ownerId} and places.deleted_at is null and places.location is not null`
      const visible = (actorId: string, householdEnabled: boolean) =>
        householdEnabled
          ? sql`(places.owner_id = ${actorId} or places.visibility = 'household')
              and places.deleted_at is null and places.location is not null`
          : ownedAlive(actorId)
      const owned = (ownerId: string) => sql`places.owner_id = ${ownerId}`

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

      const loadCoverThumbs = (coverIds: ReadonlyArray<string>) =>
        coverIds.length === 0
          ? Effect.succeed(new Map<string, string | null>())
          : sql<{ id: string; thumb_path: string | null }>`
              select id, thumb_path from media
              where ${sql.in("id", coverIds)}`.pipe(
              Effect.map((rows) => {
                const map = new Map<string, string | null>()
                for (const row of rows) map.set(row.id, row.thumb_path)
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
          const coverIds = [
            ...new Set(
              rows.map((row) => row.cover_media_id).filter((id): id is string => id != null),
            ),
          ]
          const [tagMap, listMap, factsMap, fieldsMap, thumbMap] = yield* Effect.all(
            [
              loadTags(ids),
              loadListIds(ids),
              loadFactsMap(sql, ids),
              loadCustomFieldsMap(sql, ids),
              loadCoverThumbs(coverIds),
            ],
            { concurrency: 5 },
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
              visibility: row.visibility,
              owner: { id: row.owner_id, name: row.owner_name },
              editedFields: row.manual_fields.filter(isEditable),
              tags: tagMap.get(row.id) ?? [],
              listIds: listMap.get(row.id) ?? [],
              facts: factsMap.get(row.id) ?? emptyFacts(),
              customFields: fieldsMap.get(row.id) ?? [],
              coverMediaId: row.cover_media_id,
              coverThumbUrl: coverThumbUrl(
                row.cover_media_id,
                row.cover_media_id ? (thumbMap.get(row.cover_media_id) ?? null) : null,
              ),
              createdAt: DateTime.fromDateUnsafe(row.created_at),
            }),
          )
        })

      const ownedOne = (ownerId: string, id: string) =>
        sql<PlaceRow>`
          select ${columns} from ${fromPlaces}
          where ${ownedAlive(ownerId)} and places.id = ${id}`.pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows[0] ? hydrate(rows).pipe(Effect.map((places) => places[0]!)) : new PlaceNotFound(),
          ),
        )

      const visibleOne = (actorId: string, id: string, householdEnabled: boolean) =>
        sql<PlaceRow>`
          select ${columns} from ${fromPlaces}
          where ${visible(actorId, householdEnabled)} and places.id = ${id}`.pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows[0] ? hydrate(rows).pipe(Effect.map((places) => places[0]!)) : new PlaceNotFound(),
          ),
        )

      const requireAlive = (ownerId: string, placeIds: ReadonlyArray<string>) =>
        sql<{ id: string }>`
          select places.id from places
          where ${ownedAlive(ownerId)} and ${sql.in("places.id", placeIds)}`.pipe(
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
              where owner_id = ${ownerId} and ${sql.in("id", listIds)}`.pipe(
              Effect.orDie,
              Effect.flatMap((rows) =>
                rows.length === listIds.length ? Effect.void : new ListNotFound(),
              ),
            )

      const softDelete = (ownerId: string, placeIds: ReadonlyArray<string>) =>
        sql`
          update places set deleted_at = now(), updated_at = now()
          where owner_id = ${ownerId} and deleted_at is null and location is not null
            and ${sql.in("id", placeIds)}
          returning id`.pipe(
          Effect.map((rows) => rows.length),
          Effect.orDie,
        )

      const findByGooglePlaceId = (ownerId: string, googlePlaceId: string) =>
        sql<PlaceRow>`
          select ${columns} from ${fromPlaces}
          where ${ownedAlive(ownerId)} and places.google_place_id = ${googlePlaceId}`.pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows[0]
              ? hydrate(rows).pipe(Effect.map((places) => Option.some(places[0]!)))
              : Effect.succeed(Option.none()),
          ),
        )

      const findHouseholdByGooglePlaceId = (googlePlaceId: string, excludePlaceId?: string) =>
        sql<PlaceRow>`
          select ${columns} from ${fromPlaces}
          where places.google_place_id = ${googlePlaceId}
            and places.visibility = 'household'
            and places.deleted_at is null
            ${excludePlaceId ? sql`and places.id <> ${excludePlaceId}` : sql``}`.pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows[0]
              ? hydrate(rows).pipe(Effect.map((places) => Option.some(places[0]!)))
              : Effect.succeed(Option.none()),
          ),
        )

      return {
        list: (actorId, householdEnabled, filter = {}) =>
          Effect.gen(function* () {
            const clauses = [visible(actorId, householdEnabled)]
            if (filter.status) clauses.push(sql`places.status = ${filter.status}`)
            if (filter.tag) {
              clauses.push(sql`exists (
                select 1 from place_tags pt
                join tags t on t.id = pt.tag_id
                where pt.place_id = places.id
                  and lower(t.name) = lower(${filter.tag})
              )`)
            }
            if (filter.list) {
              clauses.push(sql`exists (
                select 1 from list_items li
                join lists l on l.id = li.list_id
                where li.place_id = places.id
                  and l.owner_id = ${actorId}
                  and l.id = ${filter.list}
              )`)
            }
            const rows = yield* sql<PlaceRow>`
              select ${columns} from ${fromPlaces}
              where ${sql.and(clauses)}
              order by places.created_at desc`.pipe(Effect.orDie)
            return yield* hydrate(rows)
          }),

        get: visibleOne,

        findByGooglePlaceId,

        addFromGoogle: Effect.fn("Places.addFromGoogle")(
          function* (ownerId, details, source, options) {
            const importRunId = options?.importRunId ?? null
            const id = uuidv7()
            const inserted = yield* sql<{ id: string }>`
            insert into places (
              id, owner_id, name, category, location, address, google_place_id,
              utc_offset_minutes, source, import_run_id, last_enriched_at
            ) values (
              ${id}, ${ownerId}, ${details.name}, ${details.category},
              ${point(details.location.lat, details.location.lng)}, ${details.address},
              ${details.googlePlaceId}, ${details.utcOffsetMinutes}, ${source},
              ${importRunId}, now()
            )
            on conflict (owner_id, google_place_id)
              where google_place_id is not null and deleted_at is null
              do nothing
            returning id`.pipe(Effect.orDie)
            if (inserted[0]) {
              const place = yield* ownedOne(ownerId, inserted[0].id).pipe(Effect.orDie)
              return { place, created: true }
            }
            const existing = yield* findByGooglePlaceId(ownerId, details.googlePlaceId)
            return Option.isSome(existing)
              ? { place: existing.value, created: false }
              : yield* Effect.die(`place ${details.googlePlaceId} conflicted but was not found`)
          },
        ),

        addManual: Effect.fn("Places.addManual")(function* (ownerId, input, options) {
          const source = options?.source ?? "manual"
          const id = uuidv7()
          yield* sql`
            insert into places (id, owner_id, name, category, location, address, source, manual_fields)
            values (
              ${id}, ${ownerId}, ${input.name}, ${input.category},
              ${point(input.location.lat, input.location.lng)}, ${input.address || null},
              ${source}, ${["name", "category", "address"]}
            )`.pipe(Effect.orDie)
          const place = yield* ownedOne(ownerId, id).pipe(Effect.orDie)
          return { place, created: true }
        }),

        addFromTakeout: Effect.fn("Places.addFromTakeout")(function* (ownerId, input) {
          const id = uuidv7()
          yield* sql`
            insert into places (
              id, owner_id, name, category, location, address, notes, source, import_run_id, manual_fields
            ) values (
              ${id}, ${ownerId}, ${input.name}, ${input.category},
              ${point(input.location.lat, input.location.lng)}, ${input.address},
              ${input.notes}, 'takeout', ${input.importRunId}, ${["name", "category", "address"]}
            )`.pipe(Effect.orDie)
          const place = yield* ownedOne(ownerId, id).pipe(Effect.orDie)
          return { place, created: true }
        }),

        update: Effect.fn("Places.update")(function* (ownerId, id, patch) {
          const current = yield* ownedOne(ownerId, id)
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
            where owner_id = ${ownerId} and deleted_at is null and id = ${id}`.pipe(Effect.orDie)
          return yield* ownedOne(ownerId, id)
        }),

        setTags: Effect.fn("Places.setTags")(function* (ownerId, id, names) {
          yield* ownedOne(ownerId, id)
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
          return yield* ownedOne(ownerId, id)
        }),

        setLists: Effect.fn("Places.setLists")(function* (ownerId, id, listIds) {
          yield* ownedOne(ownerId, id)
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
          return yield* ownedOne(ownerId, id)
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
              where owner_id = ${ownerId} and deleted_at is null
                and ${sql.in("id", placeIds)}`.pipe(Effect.orDie)
            return { affected: placeIds.length }
          }
          return { affected: yield* softDelete(ownerId, placeIds) }
        }),

        listDeleted: (ownerId) =>
          Effect.gen(function* () {
            const rows = yield* sql<PlaceRow>`
              select ${columns} from ${fromPlaces}
              where ${owned(ownerId)} and places.deleted_at is not null and places.location is not null
              order by places.deleted_at desc`.pipe(Effect.orDie)
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
            where owner_id = ${ownerId} and deleted_at is not null and ${sql.in("id", placeIds)}
            returning id`.pipe(Effect.orDie)
          if (restored.length !== placeIds.length) return yield* new PlaceNotFound()
          return { affected: restored.length }
        }),

        addCustomField: Effect.fn("Places.addCustomField")(function* (ownerId, placeId, input) {
          yield* requireAlive(ownerId, [placeId])
          yield* createCustomField(sql, placeId, input)
          return yield* ownedOne(ownerId, placeId)
        }),

        updateCustomField: Effect.fn("Places.updateCustomField")(
          function* (ownerId, placeId, fieldId, patch) {
            yield* requireAlive(ownerId, [placeId])
            yield* updateCustomField(sql, placeId, fieldId, patch)
            return yield* ownedOne(ownerId, placeId)
          },
        ),

        removeCustomField: Effect.fn("Places.removeCustomField")(
          function* (ownerId, placeId, fieldId) {
            yield* requireAlive(ownerId, [placeId])
            yield* removeCustomField(sql, placeId, fieldId)
            return yield* ownedOne(ownerId, placeId)
          },
        ),

        setVisibility: Effect.fn("Places.setVisibility")(function* (
          ownerId,
          id,
          visibility,
          householdEnabled,
        ) {
          if (visibility === "household" && !householdEnabled) {
            return yield* new HouseholdDisabled({
              message: "Turn on household mode in Settings → People first.",
            })
          }
          const current = yield* ownedOne(ownerId, id)
          if (visibility === "household" && current.googlePlaceId) {
            const conflict = yield* findHouseholdByGooglePlaceId(current.googlePlaceId, id)
            if (Option.isSome(conflict)) {
              const existing = conflict.value
              return yield* new HouseholdPlaceConflict({
                existingPlaceId: existing.id,
                existingName: existing.name,
                owner: existing.owner,
              })
            }
          }
          yield* sql`
            update places set visibility = ${visibility}, updated_at = now()
            where id = ${id} and owner_id = ${ownerId} and deleted_at is null`.pipe(Effect.orDie)
          return yield* ownedOne(ownerId, id)
        }),

        copyInto: Effect.fn("Places.copyInto")(function* (
          ownerId,
          sourceId,
          targetId,
          input,
          householdEnabled,
        ) {
          if (!householdEnabled) {
            return yield* new HouseholdDisabled({
              message: "Turn on household mode in Settings → People first.",
            })
          }
          const source = yield* ownedOne(ownerId, sourceId)
          const target = yield* visibleOne(ownerId, targetId, true)
          if (target.visibility !== "household") {
            return yield* new PlaceNotFound()
          }
          if (input.notes && (!target.notes || target.notes.trim() === "") && source.notes) {
            yield* sql`
              update places set notes = ${source.notes}, updated_at = now()
              where id = ${targetId}`.pipe(Effect.orDie)
          }
          if (input.status && target.status == null && source.status != null) {
            yield* sql`
              update places set status = ${source.status}, updated_at = now()
              where id = ${targetId}`.pipe(Effect.orDie)
          }
          if (input.customFields && source.customFields.length > 0) {
            const existingLabels = new Set(
              target.customFields.map((field) => field.label.trim().toLowerCase()),
            )
            for (const field of source.customFields) {
              if (existingLabels.has(field.label.trim().toLowerCase())) continue
              yield* createCustomField(sql, targetId, {
                label: field.label,
                type: field.type,
                value: field.value,
              })
            }
          }
          return yield* visibleOne(ownerId, targetId, true)
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
