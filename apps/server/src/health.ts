import { Clock, Context, Duration, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"

export type CheckResult =
  | { readonly ok: true; readonly latencyMs: number }
  | { readonly ok: false; readonly latencyMs: number; readonly error: string }

export interface HealthReport {
  readonly status: "ok" | "error"
  readonly checks: { readonly database: CheckResult }
}

export const DATABASE_TIMEOUT = Duration.seconds(2)

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

export const runCheck = <E, R>(
  probe: Effect.Effect<unknown, E, R>,
): Effect.Effect<CheckResult, never, R> =>
  Effect.gen(function* () {
    const start = yield* Clock.currentTimeMillis
    const result = yield* probe.pipe(
      Effect.timeoutOrElse({
        duration: DATABASE_TIMEOUT,
        orElse: () =>
          Effect.fail(new Error(`timed out after ${Duration.toMillis(DATABASE_TIMEOUT)}ms`)),
      }),
      Effect.result,
    )
    const latencyMs = (yield* Clock.currentTimeMillis) - start
    return result._tag === "Success"
      ? { ok: true as const, latencyMs }
      : { ok: false as const, latencyMs, error: errorMessage(result.failure) }
  })

export const buildReport = (database: CheckResult): HealthReport => ({
  status: database.ok ? "ok" : "error",
  checks: { database },
})

export class Health extends Context.Service<
  Health,
  { readonly check: Effect.Effect<HealthReport> }
>()("placard/Health") {
  static readonly layer = Layer.effect(
    Health,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return { check: runCheck(sql`select 1`).pipe(Effect.map(buildReport)) }
    }),
  )
}
