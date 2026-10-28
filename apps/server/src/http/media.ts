import { readFile } from "node:fs/promises"
import { Api, CurrentUser, MediaNotFound, Unauthorized } from "@placard/domain"
import { Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { Auth } from "../auth/auth.ts"
import { Media } from "../media/media.ts"

const withMe = <A, E, R>(f: (me: CurrentUser["Service"]) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    return yield* f(yield* CurrentUser)
  })

export const MediaApiLive = HttpApiBuilder.group(
  Api,
  "media",
  Effect.fn(function* (handlers) {
    const media = yield* Media
    return handlers
      .handle("list", ({ params }) => withMe((me) => media.list(me.id, params.placeId)))
      .handle("upload", ({ params, payload }) =>
        withMe((me) => media.upload(me.id, params.placeId, payload)),
      )
      .handle("update", ({ params, payload }) =>
        withMe((me) => media.updateCaption(me.id, params.id, payload.caption)),
      )
      .handle("remove", ({ params }) => withMe((me) => media.remove(me.id, params.id)))
      .handle("setCover", ({ params }) => withMe((me) => media.setCover(me.id, params.id)))
  }),
)

/** Authenticated raw bytes for `<img src>` (session cookie). */
export const MediaFileRoutesLive = HttpRouter.use(
  Effect.fn(function* (router) {
    const auth = yield* Auth
    const media = yield* Media

    const serve = (which: "file" | "thumb") =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const user = yield* auth.currentUser(new Headers(request.headers))
        if (Option.isNone(user)) {
          return yield* new Unauthorized({ message: "Sign in to continue." })
        }
        const { id } = yield* HttpRouter.params
        if (!id) return yield* new MediaNotFound()
        const file = yield* media.resolveFile(user.value.id, id, which)
        const bytes = yield* Effect.tryPromise({
          try: () => readFile(file.absolutePath),
          catch: () => new MediaNotFound(),
        })
        return HttpServerResponse.uint8Array(bytes, { contentType: file.mimeType })
      }).pipe(
        Effect.catchTag("Unauthorized", () =>
          Effect.succeed(HttpServerResponse.empty({ status: 401 })),
        ),
        Effect.catchTag("MediaNotFound", () =>
          Effect.succeed(HttpServerResponse.empty({ status: 404 })),
        ),
        Effect.orDie,
      )

    yield* router.add("GET", "/api/media/:id/file", serve("file"))
    yield* router.add("GET", "/api/media/:id/thumb", serve("thumb"))
  }),
)

export const MediaRoutesLive = Layer.mergeAll(MediaApiLive, MediaFileRoutesLive)
