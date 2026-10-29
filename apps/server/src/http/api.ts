import { Api } from "@placard/domain"
import { Decide } from "@placard/module-restaurants-decide/server"
import { Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { AccountsLayer } from "../accounts/layer.ts"
import { GooglePlaces } from "../google/places.ts"
import { Import } from "../import/import.ts"
import { JobQueue } from "../jobs/queue.ts"
import { Media } from "../media/media.ts"
import { ModuleHostSearchLive } from "../modules/host-search.ts"
import { ModuleRuntime } from "../modules/loader.ts"
import { Enrichment } from "../places/enrichment.ts"
import { Lists } from "../places/lists.ts"
import { Places } from "../places/places.ts"
import { Search } from "../places/search.ts"
import { Tags } from "../places/tags.ts"
import { Tokens } from "../tokens/tokens.ts"
import { AdminApiLive, MeApiLive, SetupApiLive } from "./accounts.ts"
import { AdminAuthenticationLive, AuthenticationLive, AuthRoutesLive } from "./auth.ts"
import { DecideApiLive } from "./decide.ts"
import { HealthApiLive } from "./health.ts"
import { ImportApiLive } from "./import.ts"
import { McpRoutesLive } from "./mcp.ts"
import { MediaApiLive, MediaFileRoutesLive } from "./media.ts"
import { ModuleFileRoutesLive, ModulesApiLive } from "./modules.ts"
import { GoogleApiLive, ListsApiLive, PlacesApiLive, TagsApiLive } from "./places.ts"
import { SearchApiLive } from "./search.ts"
import { McpApiLive, TokensApiLive } from "./tokens.ts"

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
    DecideApiLive,
    ModulesApiLive,
    TokensApiLive,
    McpApiLive,
  ]),
  Layer.provide([AuthenticationLive, AdminAuthenticationLive]),
)

/** Decide plugin: host Search → ModuleHostSearch → Decide. */
const DecideLive = Decide.layer.pipe(
  Layer.provide(ModuleHostSearchLive),
  Layer.provide(Search.layer),
)

/**
 * Enrichment needs Places + Google + Media; Import needs Enrichment + Lists;
 * Decide is the restaurants.decide reference plugin.
 */
export const ServicesLayer = Import.layer.pipe(
  Layer.provideMerge(DecideLive),
  Layer.provideMerge(Search.layer),
  Layer.provideMerge(Enrichment.layer.pipe(Layer.provide(Media.layer))),
  Layer.provideMerge(Media.layer),
  Layer.provideMerge(Lists.layer),
  Layer.provideMerge(GooglePlaces.layer),
  Layer.provideMerge(Places.layer),
  Layer.provideMerge(Tags.layer),
  Layer.provideMerge(Tokens.layer),
  Layer.provideMerge(AccountsLayer),
  Layer.provideMerge(JobQueue.layer),
)

/** Every `/api` route, with app services built in. */
export const RoutesLive = Layer.mergeAll(
  ApiLive,
  AuthRoutesLive,
  MediaFileRoutesLive,
  ModuleFileRoutesLive,
  McpRoutesLive,
).pipe(Layer.provide(ServicesLayer), Layer.provide(ModuleRuntime.layer))
