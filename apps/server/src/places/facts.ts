import type { PlaceFacts } from "@placard/domain"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { emptyFacts, resolveFacts } from "../google/enrichment-map.ts"

type FactRow = {
  readonly place_id: string
  readonly key: string
  readonly value: unknown
  readonly source: string
  readonly is_override: boolean
}

/** Load effective facts for many places (override wins over Google). */
export const loadFactsMap = (sql: SqlClient.SqlClient, placeIds: ReadonlyArray<string>) => {
  if (placeIds.length === 0) {
    return Effect.succeed(new Map<string, PlaceFacts>())
  }
  return sql<FactRow>`
    select place_id, key, value, source, is_override
    from place_facts
    where ${sql.in("place_id", placeIds)}`.pipe(
    Effect.map((rows) => {
      const grouped = new Map<string, FactRow[]>()
      for (const row of rows) {
        const list = grouped.get(row.place_id) ?? []
        list.push(row)
        grouped.set(row.place_id, list)
      }
      const map = new Map<string, PlaceFacts>()
      for (const id of placeIds) {
        map.set(id, resolveFacts(grouped.get(id) ?? []))
      }
      return map
    }),
    Effect.orDie,
  )
}

export { emptyFacts, resolveFacts }
