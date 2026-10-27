import { Api, CurrentUser } from "@placard/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Invites } from "../accounts/invites.ts"
import { SignupGate } from "../accounts/signup.ts"
import { Users } from "../accounts/users.ts"
import { AppConfig } from "../config.ts"
import { InstanceSettings } from "../settings/instance-settings.ts"

export const SetupApiLive = HttpApiBuilder.group(
  Api,
  "setup",
  Effect.fn(function* (handlers) {
    const gate = yield* SignupGate
    const invites = yield* Invites
    return handlers
      .handle("status", () => gate.isOpen.pipe(Effect.map((signupOpen) => ({ signupOpen }))))
      .handle("invite", ({ params }) => invites.lookup(params.token))
  }),
)

export const MeApiLive = HttpApiBuilder.group(
  Api,
  "me",
  Effect.fn(function* (handlers) {
    const users = yield* Users
    return handlers
      .handle("get", () => CurrentUser)
      .handle("updateSettings", ({ payload }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          return yield* users.setDistanceUnit(me.id, payload.distanceUnit)
        }),
      )
  }),
)

export const AdminApiLive = HttpApiBuilder.group(
  Api,
  "admin",
  Effect.fn(function* (handlers) {
    const users = yield* Users
    const invites = yield* Invites
    const settings = yield* InstanceSettings
    const { publicUrl } = yield* AppConfig
    return handlers
      .handle("settings", () => settings.view)
      .handle("setGoogleApiKey", ({ payload }) => settings.setGoogleApiKey(payload.apiKey))
      .handle("clearGoogleApiKey", () => settings.clearGoogleApiKey)
      .handle("users", () => users.list)
      .handle("invites", () => invites.list)
      .handle("revokeInvite", ({ params }) => invites.revoke(params.id))
      .handle("createInvite", ({ payload }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          const { invite, token } = yield* invites.create(payload.email, me.id)
          return { invite, url: new URL(`/invite/${token}`, publicUrl).href }
        }),
      )
  }),
)
