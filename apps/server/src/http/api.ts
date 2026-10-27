import { Api } from "@placard/domain"
import { Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { AccountsLayer } from "../accounts/layer.ts"
import { AdminApiLive, MeApiLive, SetupApiLive } from "./accounts.ts"
import { AdminAuthenticationLive, AuthenticationLive, AuthRoutesLive } from "./auth.ts"
import { HealthApiLive } from "./health.ts"

export const ApiLive = HttpApiBuilder.layer(Api, {
  openapiPath: "/openapi.json",
}).pipe(
  Layer.provide([HealthApiLive, SetupApiLive, MeApiLive, AdminApiLive]),
  Layer.provide([AuthenticationLive, AdminAuthenticationLive]),
)

/** Every `/api` route, with account services built in. */
export const RoutesLive = Layer.mergeAll(ApiLive, AuthRoutesLive).pipe(Layer.provide(AccountsLayer))
