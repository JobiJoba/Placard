import { expect, layer } from "@effect/vitest"
import { Api } from "@placard/domain"
import { Effect, Layer } from "effect"
import { HttpServer } from "effect/http"
import { HttpApiTest } from "effect/http-api"
import { Health } from "../health.ts"
import { HealthApiLive } from "./health.ts"

const Healthy = Layer.succeed(Health, {
  check: Effect.succeed({
    status: "ok" as const,
    checks: { database: { ok: true as const, latencyMs: 1 } },
  }),
})

const Unhealthy = Layer.succeed(Health, {
  check: Effect.succeed({
    status: "error" as const,
    checks: {
      database: { ok: false as const, latencyMs: 2, error: "connection refused" },
    },
  }),
})

const makeClient = HttpApiTest.groups(Api, ["health"])

layer(Layer.mergeAll(HealthApiLive.pipe(Layer.provide(Healthy)), HttpServer.layerServices))(
  "HealthApi when healthy",
  (it) => {
    it.effect("returns an ok report", () =>
      Effect.gen(function* () {
        const client = yield* makeClient
        const report = yield* client.health()
        expect(report).toEqual({
          status: "ok",
          checks: { database: { ok: true, latencyMs: 1 } },
        })
      }),
    )
  },
)

layer(Layer.mergeAll(HealthApiLive.pipe(Layer.provide(Unhealthy)), HttpServer.layerServices))(
  "HealthApi when unhealthy",
  (it) => {
    it.effect("returns an error report", () =>
      Effect.gen(function* () {
        const client = yield* makeClient
        const report = yield* client.health()
        expect(report).toEqual({
          status: "error",
          checks: {
            database: { ok: false, latencyMs: 2, error: "connection refused" },
          },
        })
      }),
    )
  },
)
