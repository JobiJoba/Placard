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
import { HealthError, HealthOk } from "./health.ts"
import {
  AutocompleteInput,
  GoogleConfig,
  GoogleKeyMissing,
  GooglePlaceInput,
  GooglePlacesFailed,
  ManualPlaceInput,
  Place,
  PlaceNotFound,
  PlacePreview,
  PlaceSuggestion,
  SavedPlace,
} from "./places.ts"

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
  )
  .middleware(AdminAuthentication)
  .prefix("/api/admin") {}

export class PlacesApi extends HttpApiGroup.make("places")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(Place) }),
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
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: Schema.String },
      error: PlaceNotFound,
    }),
  )
  .middleware(Authentication)
  .prefix("/api/places") {}

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

export class Api extends HttpApi.make("placard")
  .add(HealthApi)
  .add(SetupApi)
  .add(MeApi)
  .add(AdminApi)
  .add(PlacesApi)
  .add(GoogleApi)
  .annotateMerge(
    OpenApi.annotations({
      title: "Placard API",
      version: "0.0.0",
    }),
  ) {}
