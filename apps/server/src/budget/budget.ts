import { randomUUID } from "node:crypto"
import {
  type BudgetSettings,
  type BudgetView,
  type CostEstimate,
  type CostEstimateInput,
  GooglePlacesFailed,
  type UsageSku,
} from "@placard/domain"
import { Context, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import {
  actionCounts,
  billingPeriod,
  type Counts,
  costMicros,
  PRICES,
  PRICING_DATE,
  totalMicros,
} from "./pricing.ts"

export const UsageSource = Context.Reference<string>("placard/UsageSource", {
  defaultValue: () => "Search & add",
})
type SettingsRow = {
  monthly_limit_cents: number | null
  pause_at_limit: boolean
  use_free_allowance: boolean
  tracking_since: Date
}
const settingsView = (r: SettingsRow): BudgetSettings => ({
  monthlyLimitUsd: r.monthly_limit_cents === null ? null : r.monthly_limit_cents / 100,
  pauseAtLimit: r.pause_at_limit,
  useFreeAllowance: r.use_free_allowance,
})

export class Budget extends Context.Service<
  Budget,
  {
    readonly view: Effect.Effect<BudgetView>
    readonly update: (settings: BudgetSettings) => Effect.Effect<BudgetView>
    readonly estimate: (input: CostEstimateInput) => Effect.Effect<CostEstimate>
    readonly reserve: (
      sku: UsageSku,
      session?: string | null,
      mapId?: string,
    ) => Effect.Effect<string, GooglePlacesFailed>
    readonly complete: (id: string) => Effect.Effect<void>
  }
>()("placard/Budget") {
  static readonly layer = Layer.effect(
    Budget,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const readSettings = sql<SettingsRow>`select * from google_budget where id = 1`.pipe(
        Effect.flatMap((rows) =>
          rows[0]
            ? Effect.succeed(rows[0])
            : Effect.die(
                new Error("Google budget settings are missing; apply database migrations."),
              ),
        ),
        Effect.orDie,
      )
      const countsFor = (month: string) =>
        sql<{
          sku: UsageSku
          n: number
        }>`select sku, count(*)::int as n from google_usage where month = ${month} group by sku`.pipe(
          Effect.map((rows) => Object.fromEntries(rows.map((r) => [r.sku, r.n])) as Counts),
          Effect.orDie,
        )
      const view = Effect.gen(function* () {
        const period = billingPeriod()
        const row = yield* readSettings
        const counts = yield* countsFor(period.month)
        const sources = yield* sql<{
          source: string
          requests: number
        }>`select source, count(*)::int as requests from google_usage where month = ${period.month} group by source order by requests desc`.pipe(
          Effect.orDie,
        )
        return {
          settings: settingsView(row),
          ...period,
          trackingSince: new Date(row.tracking_since).toISOString(),
          pricingDate: PRICING_DATE,
          estimatedUsd: totalMicros(counts, row.use_free_allowance) / 1e6,
          rows: (Object.keys(PRICES) as UsageSku[]).map((sku) => ({
            sku,
            label: PRICES[sku].label,
            requests: counts[sku] ?? 0,
            freeCap: PRICES[sku].free,
            remainingFree:
              PRICES[sku].free === null ? null : Math.max(0, PRICES[sku].free - (counts[sku] ?? 0)),
            pricePerThousand: PRICES[sku].micros / 1000,
            estimatedUsd: costMicros(sku, counts[sku] ?? 0, row.use_free_allowance) / 1e6,
          })),
          sources,
        }
      })
      return {
        view,
        update: (settings) =>
          sql`update google_budget set monthly_limit_cents = ${settings.monthlyLimitUsd === null ? null : Math.round(settings.monthlyLimitUsd * 100)}, pause_at_limit = ${settings.pauseAtLimit}, use_free_allowance = ${settings.useFreeAllowance} where id = 1`.pipe(
            Effect.orDie,
            Effect.andThen(view),
          ),
        estimate: (input) =>
          Effect.gen(function* () {
            const row = yield* readSettings
            const counts = yield* countsFor(billingPeriod().month)
            const added = actionCounts(input)
            const next = { ...counts }
            for (const sku of Object.keys(added) as UsageSku[])
              next[sku] = (counts[sku] ?? 0) + (added[sku] ?? 0)
            const after = totalMicros(next, row.use_free_allowance)
            const exceedsBudget =
              row.monthly_limit_cents !== null && after > row.monthly_limit_cents * 10000
            return {
              estimatedUsd: (after - totalMicros(counts, row.use_free_allowance)) / 1e6,
              beforeFreeAllowanceUsd: totalMicros(added, false) / 1e6,
              exceedsBudget,
              paused: exceedsBudget && row.pause_at_limit,
              useFreeAllowance: row.use_free_allowance,
            }
          }),
        reserve: (sku, session = null, mapId) =>
          sql
            .withTransaction(
              Effect.gen(function* () {
                // Lock before reading totals: shared by all server and worker processes.
                yield* sql`select id from google_budget where id = 1 for update`
                if (mapId) {
                  const existing = yield* sql<{
                    id: string
                  }>`select id from google_usage where id = ${mapId}`
                  if (existing[0]) return existing[0].id
                }
                const row = yield* readSettings
                const { month } = billingPeriod()
                const counts = yield* countsFor(month)
                const next = { ...counts, [sku]: (counts[sku] ?? 0) + 1 }
                if (
                  row.pause_at_limit &&
                  row.monthly_limit_cents !== null &&
                  totalMicros(next, row.use_free_allowance) > row.monthly_limit_cents * 10000
                ) {
                  return yield* new GooglePlacesFailed({
                    message:
                      "Google requests paused: this instance’s estimated monthly budget would be exceeded. Ask an admin to review Settings → Usage & budget.",
                  })
                }
                const id = mapId ?? randomUUID()
                const source = sku === "maps" ? "Map loads" : yield* UsageSource
                yield* sql`insert into google_usage (id, month, sku, source, session_hash) values (${id}, ${month}, ${sku}, ${source}, ${session})`
                return id
              }),
            )
            .pipe(Effect.catchTag("SqlError", Effect.die)),
        complete: (id) =>
          sql
            .withTransaction(
              Effect.gen(function* () {
                yield* sql`select id from google_budget where id = 1 for update`
                const events = yield* sql<{
                  session_hash: string | null
                  sku: UsageSku
                }>`update google_usage set succeeded = true where id = ${id} returning session_hash, sku`
                const event = events[0]
                if (event?.sku === "detailsSession" && event.session_hash) {
                  // Only successful autocomplete requests preceding a successful termination
                  // become free. Unfinished/failed sessions remain conservatively charged.
                  yield* sql`update google_usage set sku = 'autocompleteSession' where session_hash = ${event.session_hash} and sku = 'autocomplete' and succeeded = true and created_at <= (select created_at from google_usage where id = ${id}) and not exists (select 1 from google_usage where session_hash = ${event.session_hash} and sku = 'detailsSession' and succeeded = true and id <> ${id})`
                }
              }),
            )
            .pipe(Effect.orDie, Effect.asVoid),
      }
    }),
  )
}
