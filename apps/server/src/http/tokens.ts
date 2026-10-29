import { Api, CurrentUser } from "@placard/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { AppConfig } from "../config.ts"
import { Tokens } from "../tokens/tokens.ts"

export const TokensApiLive = HttpApiBuilder.group(
  Api,
  "tokens",
  Effect.fn(function* (handlers) {
    const tokens = yield* Tokens
    return handlers
      .handle("list", () =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          return yield* tokens.list(me.id)
        }),
      )
      .handle("create", ({ payload }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          return yield* tokens.create(me.id, payload)
        }),
      )
      .handle("revoke", ({ params }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          return yield* tokens.revoke(me.id, params.id)
        }),
      )
  }),
)

export const McpApiLive = HttpApiBuilder.group(
  Api,
  "mcp",
  Effect.fn(function* (handlers) {
    const config = yield* AppConfig
    return handlers.handle("status", () =>
      Effect.succeed({
        enabled: config.mcpEnabled,
        endpoint: new URL("/mcp", config.publicUrl).href,
      }),
    )
  }),
)
