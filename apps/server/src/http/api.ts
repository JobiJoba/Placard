import { Api } from "@placard/domain"
import { Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { AccountsLayer } from "../accounts/layer.ts"
import { GooglePlaces } from "../google/places.ts"
import { Places } from "../places/places.ts"
import { AdminApiLive, MeApiLive, SetupApiLive } from "./accounts.ts"
import { AdminAuthenticationLive, AuthenticationLive, AuthRoutesLive } from "./auth.ts"
import { HealthApiLive } from "./health.ts"
import { GoogleApiLive, PlacesApiLive } from "./places.ts"

export const ApiLive = HttpApiBuilder.layer(Api, {
  openapiPath: "/openapi.json",
}).pipe(
  Layer.provide([
    HealthApiLive,
    SetupApiLive,
    MeApiLive,
    AdminApiLive,
    PlacesApiLive,
    GoogleApiLive,
  ]),
  Layer.provide([AuthenticationLive, AdminAuthenticationLive]),
)

/** Every app service behind the routes. Needs an HttpClient for Google. */
export const ServicesLayer = Layer.mergeAll(Places.layer, GooglePlaces.layer).pipe(
  Layer.provideMerge(AccountsLayer),
)

/** Every `/api` route, with app services built in. */
export const RoutesLive = Layer.mergeAll(ApiLive, AuthRoutesLive).pipe(Layer.provide(ServicesLayer))
