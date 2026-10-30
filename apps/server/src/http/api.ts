import { Api } from "@placard/domain"
import { Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { AccountsLayer } from "../accounts/layer.ts"
import { LibraryExport } from "../export/export.ts"
import { GooglePlaces } from "../google/places.ts"
import { Import } from "../import/import.ts"
import { JobQueue } from "../jobs/queue.ts"
import { Media } from "../media/media.ts"
import { ModuleRuntime } from "../modules/loader.ts"
import { Enrichment } from "../places/enrichment.ts"
import { Lists } from "../places/lists.ts"
import { Places } from "../places/places.ts"
import { Search } from "../places/search.ts"
import { Tags } from "../places/tags.ts"
import { Tokens } from "../tokens/tokens.ts"
import { AdminApiLive, AvatarFileRoutesLive, MeApiLive, SetupApiLive } from "./accounts.ts"
import { AdminAuthenticationLive, AuthenticationLive, AuthRoutesLive } from "./auth.ts"
import { ExportRoutesLive } from "./export.ts"
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
    ModulesApiLive,
    TokensApiLive,
    McpApiLive,
  ]),
  Layer.provide([AuthenticationLive, AdminAuthenticationLive]),
)

/**
 * Enrichment needs Places + Google + Media; Import needs Enrichment + Lists.
 * Marketplace plugins load via ModuleRuntime (HTTP /api/m + MCP tools).
 */
export const ServicesLayer = Import.layer.pipe(
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
  Layer.provideMerge(
    LibraryExport.layer.pipe(
      Layer.provide(Places.layer),
      Layer.provide(Lists.layer),
      Layer.provide(Tags.layer),
    ),
  ),
)

/** Every `/api` route, with app services built in. */
export const RoutesLive = Layer.mergeAll(
  ApiLive,
  AuthRoutesLive,
  AvatarFileRoutesLive,
  MediaFileRoutesLive,
  ModuleFileRoutesLive,
  McpRoutesLive,
  ExportRoutesLive,
).pipe(Layer.provide(ServicesLayer), Layer.provide(ModuleRuntime.layer))
