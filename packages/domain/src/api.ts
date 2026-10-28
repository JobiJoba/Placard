import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import {
  AdminAuthentication,
  Authentication,
  CreatedInvite,
  DistanceUnit,
  Email,
  EmailAlreadyRegistered,
  GoogleKeyRejected,
  InstanceSettingsView,
  Invite,
  InviteLookup,
  InviteNotFound,
  Me,
  SetupStatus,
  UserSummary,
} from "./accounts.ts"
import {
  EnrichmentBusy,
  EnrichmentRun,
  FactKey,
  FactNotFound,
  FactOverrideInput,
  RefreshAllPlan,
} from "./facts.ts"
import { HealthError, HealthOk } from "./health.ts"
import {
  ImportDecisionUpdate,
  ImportEntry,
  ImportEntryFilter,
  ImportInvalidState,
  ImportNotFound,
  ImportRun,
  ImportUndoPreview,
  ImportUpload,
  TakeoutParseError,
} from "./import.ts"
import {
  BulkInput,
  BulkResult,
  ListInput,
  ListNotFound,
  ListUpdate,
  NameTaken,
  PlaceIds,
  PlaceList,
  TagName,
  TagNotFound,
  TagSummary,
} from "./library.ts"
import {
  MediaCaptionUpdate,
  MediaItem,
  MediaNotFound,
  MediaRejected,
  MediaUpload,
} from "./media.ts"
import {
  AutocompleteInput,
  DeletedPlace,
  GoogleConfig,
  GoogleKeyMissing,
  GooglePlaceInput,
  GooglePlacesFailed,
  ManualPlaceInput,
  Place,
  PlaceFilter,
  PlaceNotFound,
  PlacePreview,
  PlaceSuggestion,
  PlaceUpdate,
  SavedPlace,
  TagRef,
} from "./places.ts"
import { SearchFilter, SearchHit } from "./search.ts"

export class HealthApi extends HttpApiGroup.make("health", { topLevel: true }).add(
  HttpApiEndpoint.get("health", "/api/health", {
    success: [HealthOk, HealthError],
  }),
) {}

/** Unauthenticated endpoints the sign-up screens need. */
export class SetupApi extends HttpApiGroup.make("setup")
  .add(
    HttpApiEndpoint.get("status", "/setup", { success: SetupStatus }),
    HttpApiEndpoint.get("invite", "/invites/:token", {
      params: { token: Schema.String },
      success: InviteLookup,
      error: InviteNotFound,
    }),
  )
  .prefix("/api") {}

export class MeApi extends HttpApiGroup.make("me")
  .add(
    HttpApiEndpoint.get("get", "/api/me", { success: Me }),
    HttpApiEndpoint.patch("updateSettings", "/api/me/settings", {
      payload: Schema.Struct({ distanceUnit: DistanceUnit }),
      success: Me,
    }),
  )
  .middleware(Authentication) {}

export class AdminApi extends HttpApiGroup.make("admin")
  .add(
    HttpApiEndpoint.get("settings", "/settings", { success: InstanceSettingsView }),
    HttpApiEndpoint.put("setGoogleApiKey", "/settings/google-api-key", {
      payload: Schema.Struct({ apiKey: Schema.Trim.pipe(Schema.check(Schema.isMinLength(1))) }),
      success: InstanceSettingsView,
      error: GoogleKeyRejected,
    }),
    HttpApiEndpoint.delete("clearGoogleApiKey", "/settings/google-api-key", {
      success: InstanceSettingsView,
    }),
    HttpApiEndpoint.get("users", "/users", { success: Schema.Array(UserSummary) }),
    HttpApiEndpoint.get("invites", "/invites", { success: Schema.Array(Invite) }),
    HttpApiEndpoint.post("createInvite", "/invites", {
      payload: Schema.Struct({ email: Email }),
      success: CreatedInvite,
      error: EmailAlreadyRegistered,
    }),
    HttpApiEndpoint.delete("revokeInvite", "/invites/:id", {
      params: { id: Schema.String },
      error: InviteNotFound,
    }),
    HttpApiEndpoint.get("enrichmentPlan", "/enrichment/plan", { success: RefreshAllPlan }),
    HttpApiEndpoint.get("enrichmentRun", "/enrichment/run", {
      success: Schema.NullOr(EnrichmentRun),
    }),
    HttpApiEndpoint.post("refreshAll", "/enrichment/refresh-all", {
      success: EnrichmentRun,
      error: [EnrichmentBusy, GoogleKeyMissing],
    }),
  )
  .middleware(AdminAuthentication)
  .prefix("/api/admin") {}

export class PlacesApi extends HttpApiGroup.make("places")
  .add(
    HttpApiEndpoint.get("list", "/", { query: PlaceFilter, success: Schema.Array(Place) }),
    HttpApiEndpoint.get("deleted", "/deleted", { success: Schema.Array(DeletedPlace) }),
    HttpApiEndpoint.get("get", "/:id", {
      params: { id: Schema.String },
      success: Place,
      error: PlaceNotFound,
    }),
    HttpApiEndpoint.post("addFromGoogle", "/google", {
      payload: GooglePlaceInput,
      success: SavedPlace,
      error: [GoogleKeyMissing, GooglePlacesFailed],
    }),
    HttpApiEndpoint.post("addManual", "/manual", {
      payload: ManualPlaceInput,
      success: SavedPlace,
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: Schema.String },
      payload: PlaceUpdate,
      success: Place,
      error: PlaceNotFound,
    }),
    HttpApiEndpoint.put("setTags", "/:id/tags", {
      params: { id: Schema.String },
      payload: Schema.Struct({
        names: Schema.Array(TagName).pipe(Schema.check(Schema.isMaxLength(30))),
      }),
      success: Place,
      error: PlaceNotFound,
    }),
    HttpApiEndpoint.put("setLists", "/:id/lists", {
      params: { id: Schema.String },
      payload: Schema.Struct({ listIds: Schema.Array(Schema.String) }),
      success: Place,
      error: [PlaceNotFound, ListNotFound],
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: Schema.String },
      error: PlaceNotFound,
    }),
    HttpApiEndpoint.post("bulk", "/bulk", {
      payload: BulkInput,
      success: BulkResult,
      error: [PlaceNotFound, TagNotFound, ListNotFound],
    }),
    HttpApiEndpoint.post("restore", "/restore", {
      payload: Schema.Struct({ placeIds: PlaceIds }),
      success: BulkResult,
      error: PlaceNotFound,
    }),
    HttpApiEndpoint.post("refresh", "/:id/refresh", {
      params: { id: Schema.String },
      success: Place,
      error: [PlaceNotFound, GoogleKeyMissing, GooglePlacesFailed],
    }),
    HttpApiEndpoint.put("setFact", "/:id/facts/:key", {
      params: { id: Schema.String, key: FactKey },
      payload: FactOverrideInput,
      success: Place,
      error: [PlaceNotFound, FactNotFound],
    }),
    HttpApiEndpoint.delete("clearFactOverride", "/:id/facts/:key", {
      params: { id: Schema.String, key: FactKey },
      success: Place,
      error: [PlaceNotFound, FactNotFound],
    }),
  )
  .middleware(Authentication)
  .prefix("/api/places") {}

export class TagsApi extends HttpApiGroup.make("tags")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(TagSummary) }),
    HttpApiEndpoint.post("create", "/", {
      payload: Schema.Struct({ name: TagName }),
      success: TagRef,
      error: NameTaken,
    }),
    HttpApiEndpoint.patch("rename", "/:id", {
      params: { id: Schema.String },
      payload: Schema.Struct({ name: TagName }),
      success: TagRef,
      error: [TagNotFound, NameTaken],
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: Schema.String },
      error: TagNotFound,
    }),
  )
  .middleware(Authentication)
  .prefix("/api/tags") {}

export class ListsApi extends HttpApiGroup.make("lists")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(PlaceList) }),
    HttpApiEndpoint.post("create", "/", {
      payload: ListInput,
      success: PlaceList,
      error: NameTaken,
    }),
    HttpApiEndpoint.get("get", "/:id", {
      params: { id: Schema.String },
      success: PlaceList,
      error: ListNotFound,
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: Schema.String },
      payload: ListUpdate,
      success: PlaceList,
      error: [ListNotFound, NameTaken],
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: Schema.String },
      error: ListNotFound,
    }),
  )
  .middleware(Authentication)
  .prefix("/api/lists") {}

/** Google lookups for the Add page; the server holds the key for Places calls. */
export class GoogleApi extends HttpApiGroup.make("google")
  .add(
    HttpApiEndpoint.get("config", "/config", { success: GoogleConfig }),
    HttpApiEndpoint.post("autocomplete", "/autocomplete", {
      payload: AutocompleteInput,
      success: Schema.Array(PlaceSuggestion),
      error: [GoogleKeyMissing, GooglePlacesFailed],
    }),
    HttpApiEndpoint.get("preview", "/places/:googlePlaceId", {
      params: { googlePlaceId: Schema.String },
      query: { sessionToken: Schema.optional(Schema.String) },
      success: PlacePreview,
      error: [GoogleKeyMissing, GooglePlacesFailed],
    }),
  )
  .middleware(Authentication)
  .prefix("/api/google") {}

/** Structured library search — one filter Schema for UI, API, and MCP. */
export class SearchApi extends HttpApiGroup.make("search")
  .add(
    HttpApiEndpoint.post("query", "/", {
      payload: SearchFilter,
      success: Schema.Array(SearchHit),
    }),
  )
  .middleware(Authentication)
  .prefix("/api/search") {}

/** Google Takeout import: free triage, then commit / undo. */
export class ImportApi extends HttpApiGroup.make("import")
  .add(
    HttpApiEndpoint.get("listRuns", "/runs", { success: Schema.Array(ImportRun) }),
    HttpApiEndpoint.post("start", "/runs", {
      payload: ImportUpload,
      success: ImportRun,
      error: TakeoutParseError,
    }),
    HttpApiEndpoint.get("getRun", "/runs/:id", {
      params: { id: Schema.String },
      success: ImportRun,
      error: ImportNotFound,
    }),
    HttpApiEndpoint.post("listEntries", "/runs/:id/entries", {
      params: { id: Schema.String },
      payload: ImportEntryFilter,
      success: Schema.Array(ImportEntry),
      error: ImportNotFound,
    }),
    HttpApiEndpoint.post("setDecisions", "/runs/:id/decisions", {
      params: { id: Schema.String },
      payload: ImportDecisionUpdate,
      success: ImportRun,
      error: [ImportNotFound, ImportInvalidState],
    }),
    HttpApiEndpoint.post("setListDecision", "/runs/:id/lists", {
      params: { id: Schema.String },
      payload: Schema.Struct({
        sourceList: Schema.String,
        decision: Schema.Literals(["pending", "keep", "skip"]),
      }),
      success: ImportRun,
      error: [ImportNotFound, ImportInvalidState],
    }),
    HttpApiEndpoint.post("commit", "/runs/:id/commit", {
      params: { id: Schema.String },
      success: ImportRun,
      error: [ImportNotFound, ImportInvalidState],
    }),
    HttpApiEndpoint.get("undoPreview", "/runs/:id/undo", {
      params: { id: Schema.String },
      success: ImportUndoPreview,
      error: [ImportNotFound, ImportInvalidState],
    }),
    HttpApiEndpoint.post("undo", "/runs/:id/undo", {
      params: { id: Schema.String },
      payload: Schema.Struct({ confirmEdited: Schema.Boolean }),
      success: ImportRun,
      error: [ImportNotFound, ImportInvalidState],
    }),
  )
  .middleware(Authentication)
  .prefix("/api/import") {}

/** Dish photos and general media on a place. File bytes are served at /api/media/:id/file. */
export class MediaApi extends HttpApiGroup.make("media")
  .add(
    HttpApiEndpoint.get("list", "/places/:placeId", {
      params: { placeId: Schema.String },
      success: Schema.Array(MediaItem),
      error: PlaceNotFound,
    }),
    HttpApiEndpoint.post("upload", "/places/:placeId", {
      params: { placeId: Schema.String },
      payload: MediaUpload,
      success: MediaItem,
      error: [PlaceNotFound, MediaRejected],
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: Schema.String },
      payload: MediaCaptionUpdate,
      success: MediaItem,
      error: MediaNotFound,
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: Schema.String },
      success: Schema.Void,
      error: MediaNotFound,
    }),
  )
  .middleware(Authentication)
  .prefix("/api/media") {}

export class Api extends HttpApi.make("placard")
  .add(HealthApi)
  .add(SetupApi)
  .add(MeApi)
  .add(AdminApi)
  .add(PlacesApi)
  .add(TagsApi)
  .add(ListsApi)
  .add(GoogleApi)
  .add(SearchApi)
  .add(ImportApi)
  .add(MediaApi)
  .annotateMerge(
    OpenApi.annotations({
      title: "Placard API",
      version: "0.0.0",
    }),
  ) {}
