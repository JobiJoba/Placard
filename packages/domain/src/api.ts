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

export class Api extends HttpApi.make("placard")
  .add(HealthApi)
  .add(SetupApi)
  .add(MeApi)
  .add(AdminApi)
  .annotateMerge(
    OpenApi.annotations({
      title: "Placard API",
      version: "0.0.0",
    }),
  ) {}
