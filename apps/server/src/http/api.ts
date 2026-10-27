import { Api } from "@placard/domain"
import { Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { AccountsLayer } from "../accounts/layer.ts"
import { GooglePlaces } from "../google/places.ts"
import { Lists } from "../places/lists.ts"
import { Places } from "../places/places.ts"
import { Tags } from "../places/tags.ts"
import { AdminApiLive, MeApiLive, SetupApiLive } from "./accounts.ts"
import { AdminAuthenticationLive, AuthenticationLive, AuthRoutesLive } from "./auth.ts"
import { HealthApiLive } from "./health.ts"
import { GoogleApiLive, ListsApiLive, PlacesApiLive, TagsApiLive } from "./places.ts"

export const ApiLive = HttpApiBuilder.layer(Api, {
  openapiPath: "/openapi.json",
}).pipe(
  Layer.provide([
    HealthApiLive,
    SetupApiLive,
    MeApiLive,
    AdminApiLive,
    PlacesApiLive,
    TagsApiLive,
    ListsApiLive,
    GoogleApiLive,
  ]),
  Layer.provide([AuthenticationLive, AdminAuthenticationLive]),
)

/** Tags first: Places needs them. Needs an HttpClient for Google. */
export const ServicesLayer = Layer.mergeAll(Places.layer, Lists.layer, GooglePlaces.layer).pipe(
  Layer.provideMerge(Tags.layer),
  Layer.provideMerge(AccountsLayer),
)

/** Every `/api` route, with app services built in. */
export const RoutesLive = Layer.mergeAll(ApiLive, AuthRoutesLive).pipe(Layer.provide(ServicesLayer))
