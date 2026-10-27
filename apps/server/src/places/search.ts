import {
  type EditableField,
  editableFields,
  type OpeningHours,
  type Place,
  type PlaceCategory,
  type PlaceSource,
  type PlaceStatus,
  type SearchFilter,
  type SearchHit,
  type TagRef,
} from "@placard/domain"
import { Clock, Context, DateTime, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { emptyFacts, loadFactsMap } from "./facts.ts"
import { isOpenAt, isOpenTonight } from "./opening-hours.ts"

interface SearchRow {
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
  readonly utc_offset_minutes: number | null
  readonly created_at: Date
  readonly distance_meters: number | null
}

const isEditable = (field: string): field is EditableField =>
  (editableFields as ReadonlyArray<string>).includes(field)

/** Library search: PostGIS radius, trigram text, and open-now/tonight from stored hours. */
export class Search extends Context.Service<
  Search,
  {
    readonly query: (ownerId: string, filter: SearchFilter) => Effect.Effect<ReadonlyArray<SearchHit>>
  }
>()("placard/Search") {
  static readonly layer = Layer.effect(
    Search,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

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

      const loadHours = (placeIds: ReadonlyArray<string>) =>
        placeIds.length === 0
          ? Effect.succeed(new Map<string, OpeningHours>())
          : sql<{ place_id: string; value: OpeningHours }>`
              select distinct on (place_id) place_id, value
              from place_facts
              where ${sql.in("place_id", placeIds)}
                and key = 'opening_hours'
              order by place_id,
                case when source = 'manual' then 0 else 1 end,
                fetched_at desc`.pipe(
              Effect.map((rows) => {
                const map = new Map<string, OpeningHours>()
                for (const row of rows) map.set(row.place_id, row.value)
                return map
              }),
              Effect.orDie,
            )

      return {
        query: Effect.fn("Search.query")(function* (ownerId, filter) {
          const now = yield* Clock.currentTimeMillis
          const near = filter.near
          const radiusKm = filter.radiusKm
          const useRadius =
            near !== undefined && radiusKm !== undefined && Number.isFinite(radiusKm)
          const text = filter.text

          const clauses = [
            sql`p.owner_id = ${ownerId}`,
            sql`p.deleted_at is null`,
            sql`p.location is not null`,
          ]

          if (filter.category) clauses.push(sql`p.category = ${filter.category}`)
          if (filter.status) clauses.push(sql`p.status = ${filter.status}`)

          if (filter.tag) {
            clauses.push(sql`exists (
              select 1 from place_tags pt
              join tags t on t.id = pt.tag_id
              where pt.place_id = p.id
                and t.owner_id = ${ownerId}
                and lower(t.name) = lower(${filter.tag})
            )`)
          }
          if (filter.list) {
            clauses.push(sql`exists (
              select 1 from list_items li
              join lists l on l.id = li.list_id
              where li.place_id = p.id
                and l.owner_id = ${ownerId}
                and l.id = ${filter.list}
            )`)
          }

          if (text) {
            clauses.push(sql`(
              p.name % ${text}
              or p.name ilike ${"%" + text + "%"}
              or coalesce(p.notes, '') ilike ${"%" + text + "%"}
              or exists (
                select 1 from place_facts pf
                where pf.place_id = p.id
                  and pf.key in ('cuisine', 'types')
                  and pf.value::text ilike ${"%" + text + "%"}
              )
            )`)
          }

          const center = useRadius
            ? sql`st_setsrid(st_makepoint(${near.lng}, ${near.lat}), 4326)::geography`
            : null

          if (useRadius && center) {
            clauses.push(sql`st_dwithin(p.location, ${center}, ${radiusKm * 1000})`)
          }

          const distanceSelect =
            useRadius && center
              ? sql`st_distance(p.location, ${center}) as distance_meters`
              : sql`null::float8 as distance_meters`

          const orderBy = useRadius
            ? sql`distance_meters asc, p.created_at desc`
            : text
              ? sql`similarity(p.name, ${text}) desc, p.created_at desc`
              : sql`p.created_at desc`

          const rows = yield* sql<SearchRow>`
            select
              p.id, p.name, p.category,
              st_y(p.location::geometry) as lat, st_x(p.location::geometry) as lng,
              p.address, p.google_place_id, p.status, p.notes, p.source,
              p.manual_fields, p.utc_offset_minutes, p.created_at,
              ${distanceSelect}
            from places p
            where ${sql.and(clauses)}
            order by ${orderBy}
            limit 500`.pipe(Effect.orDie)

          const ids = rows.map((row) => row.id)
          const [tagMap, listMap, factsMap, hoursMap] = yield* Effect.all(
            [loadTags(ids), loadListIds(ids), loadFactsMap(sql, ids), loadHours(ids)],
            { concurrency: 4 },
          )

          const hits: SearchHit[] = []
          for (const row of rows) {
            const facts = factsMap.get(row.id) ?? emptyFacts()
            const hours = hoursMap.get(row.id) ?? facts.openingHours
            if (filter.open === "now" && !isOpenAt(hours, row.utc_offset_minutes, now)) continue
            if (filter.open === "tonight" && !isOpenTonight(hours, row.utc_offset_minutes, now)) {
              continue
            }

            const place: Place = {
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
              facts,
              createdAt: DateTime.fromDateUnsafe(row.created_at),
            }
            hits.push({
              place,
              distanceMeters: row.distance_meters,
            })
          }
          return hits
        }),
      }
    }),
  )
}
