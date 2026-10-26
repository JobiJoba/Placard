import { Api } from "@placard/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Health } from "../health.ts"

export const HealthApiLive = HttpApiBuilder.group(
  Api,
  "health",
  Effect.fn(function* (handlers) {
    const health = yield* Health
    return handlers.handle("health", () => health.check)
  }),
)
