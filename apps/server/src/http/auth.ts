import {
  AdminAuthentication,
  Authentication,
  CurrentUser,
  Forbidden,
  Unauthorized,
} from "@placard/domain"
import { Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { AUTH_BASE_PATH, Auth } from "../auth/auth.ts"
import { InstanceSettings } from "../settings/instance-settings.ts"

/** Hands `/api/auth/*` to Better Auth's fetch handler. */
export const AuthRoutesLive = HttpRouter.use(
  Effect.fn(function* (router) {
    const auth = yield* Auth
    yield* router.add("*", `${AUTH_BASE_PATH}/*`, (request) =>
      HttpServerRequest.toWeb(request).pipe(
        Effect.flatMap((webRequest) => Effect.promise(() => auth.handler(webRequest))),
        Effect.map(HttpServerResponse.fromWeb),
        Effect.orDie,
      ),
    )
  }),
)

const signedInUser = (auth: Auth["Service"], settings: InstanceSettings["Service"]) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const user = yield* auth.currentUser(new Headers(request.headers))
    if (Option.isNone(user)) {
      return yield* new Unauthorized({ message: "Sign in to continue." })
    }
    const householdEnabled = yield* settings.householdEnabled
    return { ...user.value, householdEnabled }
  })

export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const auth = yield* Auth
    const settings = yield* InstanceSettings
    return Authentication.of(
      Effect.fn(function* (httpEffect) {
        const user = yield* signedInUser(auth, settings)
        return yield* Effect.provideService(httpEffect, CurrentUser, user)
      }),
    )
  }),
)

export const AdminAuthenticationLive = Layer.effect(
  AdminAuthentication,
  Effect.gen(function* () {
    const auth = yield* Auth
    const settings = yield* InstanceSettings
    return AdminAuthentication.of(
      Effect.fn(function* (httpEffect) {
        const user = yield* signedInUser(auth, settings)
        if (user.role !== "admin") {
          return yield* new Forbidden({ message: "Only the admin can do that." })
        }
        return yield* Effect.provideService(httpEffect, CurrentUser, user)
      }),
    )
  }),
)
