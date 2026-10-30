import {
  AdminAuthentication,
  Authentication,
  CurrentUser,
  Forbidden,
  Unauthorized,
} from "@placard/domain"
import { Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { Users } from "../accounts/users.ts"
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

const signedInUser = (
  auth: Auth["Service"],
  settings: InstanceSettings["Service"],
  users: Users["Service"],
) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const session = yield* auth.currentUser(new Headers(request.headers))
    if (Option.isNone(session)) {
      return yield* new Unauthorized({ message: "Sign in to continue." })
    }
    const base = yield* users.get(session.value.id)
    if (Option.isNone(base)) {
      return yield* new Unauthorized({ message: "Sign in to continue." })
    }
    const householdEnabled = yield* settings.householdEnabled
    return { ...base.value, householdEnabled }
  })

export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const auth = yield* Auth
    const settings = yield* InstanceSettings
    const users = yield* Users
    return Authentication.of(
      Effect.fn(function* (httpEffect) {
        const user = yield* signedInUser(auth, settings, users)
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
    const users = yield* Users
    return AdminAuthentication.of(
      Effect.fn(function* (httpEffect) {
        const user = yield* signedInUser(auth, settings, users)
        if (user.role !== "admin") {
          return yield* new Forbidden({ message: "Only the admin can do that." })
        }
        return yield* Effect.provideService(httpEffect, CurrentUser, user)
      }),
    )
  }),
)
