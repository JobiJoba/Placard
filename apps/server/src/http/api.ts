import { Api } from "@placard/domain"
import { Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { AccountsLayer } from "../accounts/layer.ts"
import { GooglePlaces } from "../google/places.ts"
import { Import } from "../import/import.ts"
import { JobQueue } from "../jobs/queue.ts"
import { Media } from "../media/media.ts"
import { Enrichment } from "../places/enrichment.ts"
import { Lists } from "../places/lists.ts"
import { Places } from "../places/places.ts"
import { Search } from "../places/search.ts"
import { Tags } from "../places/tags.ts"
import { AdminApiLive, MeApiLive, SetupApiLive } from "./accounts.ts"
import { AdminAuthenticationLive, AuthenticationLive, AuthRoutesLive } from "./auth.ts"
import { HealthApiLive } from "./health.ts"
import { ImportApiLive } from "./import.ts"
import { MediaApiLive, MediaFileRoutesLive } from "./media.ts"
import { GoogleApiLive, ListsApiLive, PlacesApiLive, TagsApiLive } from "./places.ts"
import { SearchApiLive } from "./search.ts"

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
    SearchApiLive,
    ImportApiLive,
    MediaApiLive,
  ]),
  Layer.provide([AuthenticationLive, AdminAuthenticationLive]),
)

/** Enrichment needs Places + Google + Media; Import needs Enrichment + Lists; Media needs Places. */
export const ServicesLayer = Import.layer.pipe(
  Layer.provideMerge(Search.layer),
  Layer.provideMerge(Enrichment.layer.pipe(Layer.provide(Media.layer))),
  Layer.provideMerge(Media.layer),
  Layer.provideMerge(Lists.layer),
  Layer.provideMerge(GooglePlaces.layer),
  Layer.provideMerge(Places.layer),
  Layer.provideMerge(Tags.layer),
  Layer.provideMerge(AccountsLayer),
  Layer.provideMerge(JobQueue.layer),
)

/** Every `/api` route, with app services built in. */
export const RoutesLive = Layer.mergeAll(ApiLive, AuthRoutesLive, MediaFileRoutesLive).pipe(
  Layer.provide(ServicesLayer),
)
