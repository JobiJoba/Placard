import {
  DecidePoolEmpty,
  type DecidePreview,
  type DecideRequest,
  type DecideResult,
  type SearchFilter,
  type SearchHit,
} from "@placard/domain"
import { ModuleHostSearch } from "@placard/module-sdk"
import { Clock, Context, Duration, Effect, Layer, Random } from "effect"
import { SqlClient } from "effect/sql"
import { v7 as uuidv7 } from "uuid"

/** How long a pick stays "recent" for the avoid-recent filter. */
export const AVOID_RECENT_WINDOW = Duration.days(14)

const emptyMessage = (request: DecideRequest): string => {
  if (request.open === "tonight") {
    return "Nothing open tonight matches these filters. Try turning off open tonight, widening the radius, or disabling avoid recent."
  }
  if (request.open === "now") {
    return "Nothing open now matches these filters. Try turning off open now, widening the radius, or disabling avoid recent."
  }
  return "No restaurants match these filters. Try a different list, tag, or radius — or turn off avoid recent."
}

const restaurantFilter = (request: DecideRequest): SearchFilter => {
  const { avoidRecent: _, ...filter } = request
  return { ...filter, category: "restaurant" }
}

/** Drop hits whose place was picked inside the avoid-recent window. */
export const excludeRecent = (
  hits: ReadonlyArray<SearchHit>,
  recentPlaceIds: ReadonlySet<string>,
): ReadonlyArray<SearchHit> => hits.filter((hit) => !recentPlaceIds.has(hit.place.id))

export class Decide extends Context.Service<
  Decide,
  {
    readonly preview: (ownerId: string, request: DecideRequest) => Effect.Effect<DecidePreview>
    readonly spin: (
      ownerId: string,
      request: DecideRequest,
    ) => Effect.Effect<DecideResult, DecidePoolEmpty>
  }
>()("placard/module-restaurants-decide/Decide") {
  static readonly layer = Layer.effect(
    Decide,
    Effect.gen(function* () {
      const search = yield* ModuleHostSearch
      const sql = yield* SqlClient.SqlClient

      const recentPlaceIds = (ownerId: string) =>
        Effect.gen(function* () {
          const cutoff = new Date(
            (yield* Clock.currentTimeMillis) - Duration.toMillis(AVOID_RECENT_WINDOW),
          )
          const rows = yield* sql<{ place_id: string }>`
            select distinct place_id from decide_picks
            where owner_id = ${ownerId} and picked_at >= ${cutoff}`.pipe(Effect.orDie)
          return new Set(rows.map((row) => row.place_id))
        })

      const pool = (ownerId: string, request: DecideRequest) =>
        Effect.gen(function* () {
          const hits = yield* search.query(ownerId, restaurantFilter(request))
          if (!request.avoidRecent) return hits as ReadonlyArray<SearchHit>
          const recent = yield* recentPlaceIds(ownerId)
          return excludeRecent(hits, recent)
        })

      const recordPick = (ownerId: string, placeId: string) =>
        sql`
          insert into decide_picks (id, owner_id, place_id, picked_at)
          values (${uuidv7()}, ${ownerId}, ${placeId}, now())`.pipe(Effect.orDie, Effect.asVoid)

      return {
        preview: Effect.fn("Decide.preview")(function* (ownerId, request) {
          const hits = yield* pool(ownerId, request)
          return { count: hits.length }
        }),

        spin: Effect.fn("Decide.spin")(function* (ownerId, request) {
          const hits = yield* pool(ownerId, request)
          if (hits.length === 0) {
            return yield* new DecidePoolEmpty({ message: emptyMessage(request) })
          }
          const index = yield* Random.nextIntBetween(0, hits.length, { halfOpen: true })
          const hit = hits[index]
          if (!hit) {
            return yield* new DecidePoolEmpty({ message: emptyMessage(request) })
          }
          yield* recordPick(ownerId, hit.place.id)
          return { place: hit.place }
        }),
      }
    }),
  )
}
