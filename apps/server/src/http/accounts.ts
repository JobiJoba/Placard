import { Api, CurrentUser } from "@placard/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Invites } from "../accounts/invites.ts"
import { SignupGate } from "../accounts/signup.ts"
import { Users } from "../accounts/users.ts"
import { AppConfig } from "../config.ts"
import { JobQueue } from "../jobs/queue.ts"
import { Enrichment } from "../places/enrichment.ts"
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
    const settings = yield* InstanceSettings
    return handlers
      .handle("get", () => CurrentUser)
      .handle("updateSettings", ({ payload }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          const base = yield* users.setDistanceUnit(me.id, payload.distanceUnit)
          const householdEnabled = yield* settings.householdEnabled
          return { ...base, householdEnabled }
        }),
      )
      .handle("householdMembers", () =>
        Effect.gen(function* () {
          const enabled = yield* settings.householdEnabled
          if (!enabled) return []
          return yield* users.householdMembers
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
    const enrichment = yield* Enrichment
    const jobs = yield* JobQueue
    const { publicUrl } = yield* AppConfig
    return handlers
      .handle("settings", () => settings.view)
      .handle("setGoogleApiKey", ({ payload }) => settings.setGoogleApiKey(payload.apiKey))
      .handle("clearGoogleApiKey", () => settings.clearGoogleApiKey)
      .handle("setModuleUpdateCheckHours", ({ payload }) =>
        settings.setModuleUpdateCheckHours(payload.hours),
      )
      .handle("setHouseholdEnabled", ({ payload }) =>
        settings.setHouseholdEnabled(payload.enabled),
      )
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
      .handle("enrichmentPlan", () => withMe((me) => enrichment.planRefreshAll(me.id)))
      .handle("enrichmentRun", () => withMe((me) => enrichment.currentRun(me.id)))
      .handle("refreshAll", () =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          const { run, placeIds } = yield* enrichment.startRefreshAll(me.id)
          yield* Effect.forEach(
            placeIds,
            (placeId, index) =>
              jobs.enqueueEnrichPlace(
                { placeId, ownerId: me.id, runId: run.id },
                { startAfterSeconds: index * 0.25 },
              ),
            { concurrency: 8, discard: true },
          )
          return run
        }),
      )
  }),
)

const withMe = <A, E, R>(f: (me: CurrentUser["Service"]) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    return yield* f(yield* CurrentUser)
  })
