import { Schema } from "effect"
import { HttpApiSchema } from "effect/http-api"

export const CheckOk = Schema.Struct({
  ok: Schema.Literal(true),
  latencyMs: Schema.Number,
})

export const CheckFail = Schema.Struct({
  ok: Schema.Literal(false),
  latencyMs: Schema.Number,
  error: Schema.String,
})

export const CheckResult = Schema.Union([CheckOk, CheckFail])
export type CheckResult = typeof CheckResult.Type

/** Healthy report returned with HTTP 200. */
export const HealthOk = Schema.Struct({
  status: Schema.Literal("ok"),
  checks: Schema.Struct({
    database: CheckResult,
  }),
}).pipe(HttpApiSchema.status(200))
export type HealthOk = typeof HealthOk.Type

/** Unhealthy report returned with HTTP 503. */
export const HealthError = Schema.Struct({
  status: Schema.Literal("error"),
  checks: Schema.Struct({
    database: CheckResult,
  }),
}).pipe(HttpApiSchema.status(503))
export type HealthError = typeof HealthError.Type

export const HealthReport = Schema.Union([HealthOk, HealthError])
export type HealthReport = typeof HealthReport.Type
