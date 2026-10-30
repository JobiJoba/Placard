import {
  EnrichmentBusy,
  type EnrichmentRun,
  type FactKey,
  GoogleKeyMissing,
  type GooglePlacesError,
  type PlaceNotFound,
  type PlaceRefreshMode,
} from "@placard/domain"
import { Context, DateTime, Effect, Layer, Option } from "effect"
import { SqlClient } from "effect/sql"
import { v7 as uuidv7 } from "uuid"
import { factsFromGoogle } from "../google/enrichment-map.ts"
import type { GooglePlaceDetails } from "../google/places.ts"
import { GooglePlaces } from "../google/places.ts"
import { Media } from "../media/media.ts"
import { InstanceSettings } from "../settings/instance-settings.ts"
import { applyFetched } from "./overrides.ts"
import { Places } from "./places.ts"

export interface RefreshAllStart {
  readonly run: EnrichmentRun
  readonly placeIds: ReadonlyArray<string>
}

/** Writes Google details into `place_facts` and refreshes non-overridden place fields. */
export class Enrichment extends Context.Service<
  Enrichment,
  {
    /** Persist facts from details already fetched (e.g. on add). No Google call. */
    readonly applyDetails: (
      ownerId: string,
      placeId: string,
      details: GooglePlaceDetails,
    ) => Effect.Effect<void, PlaceNotFound>
    readonly enrichPlace: (
      ownerId: string,
      placeId: string,
      options?: { readonly force?: boolean; readonly mode?: PlaceRefreshMode },
    ) => Effect.Effect<void, PlaceNotFound | GooglePlacesError>
    readonly setOverride: (
      ownerId: string,
      placeId: string,
      key: FactKey,
      value: string | null,
    ) => Effect.Effect<void, PlaceNotFound>
    readonly clearOverride: (
      ownerId: string,
      placeId: string,
      key: FactKey,
    ) => Effect.Effect<void, PlaceNotFound>
    readonly planRefreshAll: (ownerId: string) => Effect.Effect<{ placeCount: number }>
    readonly startRefreshAll: (
      ownerId: string,
    ) => Effect.Effect<RefreshAllStart, EnrichmentBusy | GoogleKeyMissing>
    readonly currentRun: (ownerId: string) => Effect.Effect<EnrichmentRun | null>
    readonly markJobDone: (runId: string, ok: boolean) => Effect.Effect<void>
  }
>()("placard/Enrichment") {
  static readonly layer = Layer.effect(
    Enrichment,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const google = yield* GooglePlaces
      const places = yield* Places
      const media = yield* Media
      const settings = yield* InstanceSettings

      const requireGoogleKey = settings.googleApiKey.pipe(
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.fail(
                new GoogleKeyMissing({
                  message: "No Google API key is set. Ask your admin to add one in Settings.",
                }),
              ),
            onSome: () => Effect.void,
          }),
        ),
      )

      const toRun = (row: {
        id: string
        status: EnrichmentRun["status"]
        total: number
        completed: number
        failed: number
        created_at: Date
        finished_at: Date | null
      }): EnrichmentRun => ({
        id: row.id,
        status: row.status,
        total: row.total,
        completed: row.completed,
        failed: row.failed,
        createdAt: DateTime.fromDateUnsafe(row.created_at),
        finishedAt: row.finished_at ? DateTime.fromDateUnsafe(row.finished_at) : null,
      })

      const writeGoogleFacts = (placeId: string, details: GooglePlaceDetails) =>
        Effect.gen(function* () {
          const mapped = factsFromGoogle(
            details.enrichment as Parameters<typeof factsFromGoogle>[0],
          )
          yield* sql`
            delete from place_facts
            where place_id = ${placeId} and source = 'google'`.pipe(Effect.orDie)
          if (mapped.length === 0) return
          for (const fact of mapped) {
            yield* sql`
              insert into place_facts (place_id, key, value, source, is_override, fetched_at)
              values (
                ${placeId}, ${fact.key}, ${JSON.stringify(fact.value)}::jsonb,
                'google', false, now()
              )`.pipe(Effect.orDie)
          }
        })

      const applyDetails = Effect.fn("Enrichment.applyDetails")(
        function* (ownerId, placeId, details) {
          const place = yield* places.get(ownerId, placeId)
          const edited = applyFetched(
            {
              values: {
                name: place.name,
                category: place.category,
                address: place.address,
              },
              manual: place.editedFields,
            },
            {
              name: details.name,
              category: details.category,
              address: details.address,
            },
          )
          yield* sql`
          update places set
            name = ${edited.values.name},
            category = ${edited.values.category},
            address = ${edited.values.address},
            utc_offset_minutes = ${details.utcOffsetMinutes},
            last_enriched_at = now(),
            updated_at = now()
          where id = ${placeId} and owner_id = ${ownerId} and deleted_at is null`.pipe(Effect.orDie)
          yield* writeGoogleFacts(placeId, details)

          if (details.photoName) {
            yield* google.photoBytes(details.photoName).pipe(
              Effect.flatMap((bytes) => media.syncGoogleCover(ownerId, placeId, bytes)),
              Effect.catchTag("GooglePlacesFailed", () => Effect.void),
              Effect.catchTag("GoogleKeyMissing", () => Effect.void),
              Effect.catchTag("MediaRejected", () => Effect.void),
            )
          }
        },
      )

      return {
        applyDetails,

        enrichPlace: Effect.fn("Enrichment.enrichPlace")(function* (ownerId, placeId, options) {
          const place = yield* places.get(ownerId, placeId)
          if (!place.googlePlaceId) return
          const mode = options?.mode ?? "merge"
          if (mode === "replace") {
            // Drop owner fact overrides and edited-field pins so Google can refill them.
            yield* sql`
              delete from place_facts
              where place_id = ${placeId} and source = 'manual'`.pipe(Effect.orDie)
            yield* sql`
              update places set
                manual_fields = ${[] as ReadonlyArray<string>},
                updated_at = now()
              where id = ${placeId} and owner_id = ${ownerId} and deleted_at is null`.pipe(
              Effect.orDie,
            )
          }
          const details = yield* google.details(place.googlePlaceId, null, {
            force: options?.force ?? true,
          })
          yield* applyDetails(ownerId, placeId, details)
        }),

        setOverride: Effect.fn("Enrichment.setOverride")(function* (ownerId, placeId, key, value) {
          yield* places.get(ownerId, placeId)
          if (value === null || value.trim() === "") {
            yield* sql`
              delete from place_facts
              where place_id = ${placeId} and key = ${key} and source = 'manual'`.pipe(Effect.orDie)
            return
          }
          yield* sql`
            insert into place_facts (place_id, key, value, source, is_override, fetched_at)
            values (${placeId}, ${key}, ${JSON.stringify(value)}::jsonb, 'manual', true, now())
            on conflict (place_id, key, source) do update set
              value = excluded.value,
              is_override = true,
              fetched_at = now()`.pipe(Effect.orDie)
        }),

        clearOverride: Effect.fn("Enrichment.clearOverride")(function* (ownerId, placeId, key) {
          yield* places.get(ownerId, placeId)
          yield* sql`
            delete from place_facts
            where place_id = ${placeId} and key = ${key} and source = 'manual'`.pipe(Effect.orDie)
        }),

        planRefreshAll: (ownerId) =>
          sql<{ count: number }>`
            select count(*)::int as count from places
            where owner_id = ${ownerId}
              and deleted_at is null
              and google_place_id is not null`.pipe(
            Effect.map((rows) => ({ placeCount: rows[0]?.count ?? 0 })),
            Effect.orDie,
          ),

        startRefreshAll: Effect.fn("Enrichment.startRefreshAll")(function* (ownerId) {
          yield* requireGoogleKey

          const running = yield* sql<{ id: string }>`
            select id from enrichment_runs
            where owner_id = ${ownerId} and status = 'running'
            limit 1`.pipe(Effect.orDie)
          if (running[0]) {
            return yield* new EnrichmentBusy({
              message: "A refresh is already running. Wait for it to finish.",
            })
          }

          const ids = yield* sql<{ id: string }>`
            select id from places
            where owner_id = ${ownerId}
              and deleted_at is null
              and google_place_id is not null
            order by created_at`.pipe(Effect.orDie)

          const runId = uuidv7()
          if (ids.length === 0) {
            const [row] = yield* sql<Parameters<typeof toRun>[0]>`
              insert into enrichment_runs (id, owner_id, status, total, completed, finished_at)
              values (${runId}, ${ownerId}, 'done', 0, 0, now())
              returning id, status, total, completed, failed, created_at, finished_at`.pipe(
              Effect.orDie,
            )
            return { run: toRun(row!), placeIds: [] }
          }

          const [row] = yield* sql<Parameters<typeof toRun>[0]>`
            insert into enrichment_runs (id, owner_id, status, total)
            values (${runId}, ${ownerId}, 'running', ${ids.length})
            returning id, status, total, completed, failed, created_at, finished_at`.pipe(
            Effect.orDie,
          )
          return { run: toRun(row!), placeIds: ids.map((r) => r.id) }
        }),

        currentRun: (ownerId) =>
          sql<Parameters<typeof toRun>[0]>`
            select id, status, total, completed, failed, created_at, finished_at
            from enrichment_runs
            where owner_id = ${ownerId}
            order by created_at desc
            limit 1`.pipe(
            Effect.map((rows) => (rows[0] ? toRun(rows[0]) : null)),
            Effect.orDie,
          ),

        markJobDone: (runId, ok) =>
          sql`
            update enrichment_runs set
              completed = completed + ${ok ? 1 : 0},
              failed = failed + ${ok ? 0 : 1},
              status = case
                when completed + failed + 1 >= total then
                  case when failed + ${ok ? 0 : 1} = total then 'failed' else 'done' end
                else status
              end,
              finished_at = case
                when completed + failed + 1 >= total then now()
                else finished_at
              end
            where id = ${runId} and status = 'running'`.pipe(Effect.asVoid, Effect.orDie),
      }
    }),
  )
}
