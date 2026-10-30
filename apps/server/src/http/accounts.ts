import { readFile } from "node:fs/promises"
import { Api, CurrentUser, MediaNotFound, Unauthorized } from "@placard/domain"
import { Effect, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { Invites } from "../accounts/invites.ts"
import { SignupGate } from "../accounts/signup.ts"
import { type MeBase, Users } from "../accounts/users.ts"
import { Auth } from "../auth/auth.ts"
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
    const asMe = (base: MeBase) =>
      Effect.gen(function* () {
        const householdEnabled = yield* settings.householdEnabled
        return { ...base, householdEnabled }
      })

    return handlers
      .handle("get", () => CurrentUser)
      .handle("updateSettings", ({ payload }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          const base = yield* users.setDistanceUnit(me.id, payload.distanceUnit)
          return yield* asMe(base)
        }),
      )
      .handle("updateProfile", ({ payload }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          const base = yield* users.updateProfile(me.id, payload.name)
          return yield* asMe(base)
        }),
      )
      .handle("setAvatar", ({ payload }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          const base = yield* users.setAvatar(me.id, payload)
          return yield* asMe(base)
        }),
      )
      .handle("clearAvatar", () =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          const base = yield* users.clearAvatar(me.id)
          return yield* asMe(base)
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
      .handle("setHouseholdEnabled", ({ payload }) => settings.setHouseholdEnabled(payload.enabled))
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

/** Authenticated avatar bytes for `<img src>` (any signed-in user). */
export const AvatarFileRoutesLive = HttpRouter.use(
  Effect.fn(function* (router) {
    const auth = yield* Auth
    const users = yield* Users

    yield* router.add(
      "GET",
      "/api/avatars/:id",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const session = yield* auth.currentUser(new Headers(request.headers))
        if (Option.isNone(session)) {
          return yield* new Unauthorized({ message: "Sign in to continue." })
        }
        const { id } = yield* HttpRouter.params
        if (!id) return yield* new MediaNotFound()
        const file = yield* users.resolveAvatarFile(id)
        const bytes = yield* Effect.tryPromise({
          try: () => readFile(file.absolutePath),
          catch: () => new MediaNotFound(),
        })
        return HttpServerResponse.uint8Array(bytes, {
          contentType: file.mimeType,
          headers: { "cache-control": "private, max-age=0, must-revalidate" },
        })
      }).pipe(
        Effect.catchTag("Unauthorized", () =>
          Effect.succeed(HttpServerResponse.empty({ status: 401 })),
        ),
        Effect.catchTag("MediaNotFound", () =>
          Effect.succeed(HttpServerResponse.empty({ status: 404 })),
        ),
        Effect.orDie,
      ),
    )
  }),
)
