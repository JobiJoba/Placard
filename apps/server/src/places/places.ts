import {
  type ManualPlaceInput,
  type Place,
  type PlaceCategory,
  PlaceNotFound,
  type PlaceSource,
  type PlaceStatus,
  type SavedPlace,
} from "@placard/domain"
import { Context, DateTime, Effect, Layer, Option } from "effect"
import { SqlClient } from "effect/sql"
import { v7 as uuidv7 } from "uuid"
import type { GooglePlaceDetails } from "../google/places.ts"

interface PlaceRow {
  readonly id: string
  readonly name: string
  readonly category: PlaceCategory
  readonly lat: number
  readonly lng: number
  readonly address: string | null
  readonly google_place_id: string | null
  readonly status: PlaceStatus | null
  readonly source: PlaceSource
  readonly created_at: Date
}

const toPlace = (row: PlaceRow): Place => ({
  id: row.id,
  name: row.name,
  category: row.category,
  location: { lat: row.lat, lng: row.lng },
  address: row.address,
  googlePlaceId: row.google_place_id,
  status: row.status,
  source: row.source,
  createdAt: DateTime.fromDateUnsafe(row.created_at),
})

/** A user's places. Every query is scoped to `ownerId`. */
export class Places extends Context.Service<
  Places,
  {
    readonly list: (ownerId: string) => Effect.Effect<ReadonlyArray<Place>>
    readonly get: (ownerId: string, id: string) => Effect.Effect<Place, PlaceNotFound>
    readonly findByGooglePlaceId: (
      ownerId: string,
      googlePlaceId: string,
    ) => Effect.Effect<Option.Option<Place>>
    readonly addFromGoogle: (
      ownerId: string,
      details: GooglePlaceDetails,
      source: Extract<PlaceSource, "autocomplete" | "map_pick">,
    ) => Effect.Effect<SavedPlace>
    readonly addManual: (ownerId: string, input: ManualPlaceInput) => Effect.Effect<SavedPlace>
    readonly remove: (ownerId: string, id: string) => Effect.Effect<void, PlaceNotFound>
  }
>()("placard/Places") {
  static readonly layer = Layer.effect(
    Places,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const columns = sql`
        id, name, category,
        st_y(location::geometry) as lat, st_x(location::geometry) as lng,
        address, google_place_id, status, source, created_at`
      const point = (lat: number, lng: number) =>
        sql`st_setsrid(st_makepoint(${lng}, ${lat}), 4326)::geography`
      const visible = (ownerId: string) =>
        sql`owner_id = ${ownerId} and deleted_at is null and location is not null`

      const findByGooglePlaceId = (ownerId: string, googlePlaceId: string) =>
        sql<PlaceRow>`
          select ${columns} from places
          where ${visible(ownerId)} and google_place_id = ${googlePlaceId}`.pipe(
          Effect.map((rows) => Option.fromNullishOr(rows[0]).pipe(Option.map(toPlace))),
          Effect.orDie,
        )

      return {
        list: (ownerId) =>
          sql<PlaceRow>`
            select ${columns} from places
            where ${visible(ownerId)}
            order by created_at desc`.pipe(
            Effect.map((rows) => rows.map(toPlace)),
            Effect.orDie,
          ),

        get: (ownerId, id) =>
          sql<PlaceRow>`select ${columns} from places where ${visible(ownerId)} and id = ${id}`.pipe(
            Effect.orDie,
            Effect.flatMap((rows) =>
              rows[0] ? Effect.succeed(toPlace(rows[0])) : new PlaceNotFound(),
            ),
          ),

        findByGooglePlaceId,

        addFromGoogle: Effect.fn("Places.addFromGoogle")(function* (ownerId, details, source) {
          const inserted = yield* sql<PlaceRow>`
            insert into places (
              id, owner_id, name, category, location, address, google_place_id,
              utc_offset_minutes, source, last_enriched_at
            ) values (
              ${uuidv7()}, ${ownerId}, ${details.name}, ${details.category},
              ${point(details.location.lat, details.location.lng)}, ${details.address},
              ${details.googlePlaceId}, ${details.utcOffsetMinutes}, ${source}, now()
            )
            on conflict (owner_id, google_place_id)
              where google_place_id is not null and deleted_at is null
              do nothing
            returning ${columns}`.pipe(Effect.orDie)
          if (inserted[0]) return { place: toPlace(inserted[0]), created: true }

          const existing = yield* findByGooglePlaceId(ownerId, details.googlePlaceId)
          return Option.isSome(existing)
            ? { place: existing.value, created: false }
            : yield* Effect.die(`place ${details.googlePlaceId} conflicted but was not found`)
        }),

        addManual: (ownerId, input) =>
          sql<PlaceRow>`
            insert into places (id, owner_id, name, category, location, address, source)
            values (
              ${uuidv7()}, ${ownerId}, ${input.name}, ${input.category},
              ${point(input.location.lat, input.location.lng)}, ${input.address || null}, 'manual'
            )
            returning ${columns}`.pipe(
            Effect.map((rows) => ({ place: toPlace(rows[0] as PlaceRow), created: true })),
            Effect.orDie,
          ),

        remove: (ownerId, id) =>
          sql`
            update places set deleted_at = now(), updated_at = now()
            where ${visible(ownerId)} and id = ${id}
            returning id`.pipe(
            Effect.orDie,
            Effect.flatMap((rows) => (rows.length > 0 ? Effect.void : new PlaceNotFound())),
          ),
      }
    }),
  )
}
