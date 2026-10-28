import { readFile, stat } from "node:fs/promises"
import { extname, join } from "node:path"
import { Api, CurrentUser } from "@placard/domain"
import { Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { Auth } from "../auth/auth.ts"
import { AppConfig } from "../config.ts"
import { ModuleRuntime } from "../modules/loader.ts"
import { Modules } from "../modules/modules.ts"

const ModulesServiceLive = Modules.layer.pipe(Layer.provide(ModuleRuntime.layer))

export const ModulesApiLive = HttpApiBuilder.group(
  Api,
  "modules",
  Effect.fn(function* (handlers) {
    const modules = yield* Modules
    return handlers
      .handle("catalog", () =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          return yield* modules.catalog(me.id)
        }),
      )
      .handle("installed", () => modules.installed)
      .handle("install", ({ payload }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          return yield* modules.install(me.role, payload.moduleId)
        }),
      )
      .handle("upload", ({ payload }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          return yield* modules.upload(me.role, payload)
        }),
      )
      .handle("uninstall", ({ params }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          yield* modules.uninstall(me.role, params.id)
        }),
      )
      .handle("setEnabled", ({ params, payload }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          return yield* modules.setEnabled(me.role, params.id, payload.enabled)
        }),
      )
      .handle("me", () =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          return yield* modules.me(me.id)
        }),
      )
      .handle("setVisible", ({ params, payload }) =>
        Effect.gen(function* () {
          const me = yield* CurrentUser
          return yield* modules.setVisible(me.id, params.id, payload.visible)
        }),
      )
  }),
).pipe(Layer.provide(ModulesServiceLive))

const mimeFor = (path: string) => {
  switch (extname(path).toLowerCase()) {
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8"
    case ".css":
      return "text/css; charset=utf-8"
    case ".json":
      return "application/json; charset=utf-8"
    case ".svg":
      return "image/svg+xml; charset=utf-8"
    case ".png":
      return "image/png"
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".webp":
      return "image/webp"
    case ".map":
      return "application/json"
    default:
      return "application/octet-stream"
  }
}

/** Authenticated plugin assets + custom `/api/m/:id/*` HTTP from uploaded modules. */
export const ModuleFileRoutesLive = HttpRouter.use(
  Effect.fn(function* (router) {
    const auth = yield* Auth
    const modules = yield* Modules
    const runtime = yield* ModuleRuntime
    const { modulesDir } = yield* AppConfig

    yield* router.add(
      "GET",
      "/api/modules/:id/assets/*",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const user = yield* auth.currentUser(new Headers(request.headers))
        if (Option.isNone(user)) {
          return HttpServerResponse.empty({ status: 401 })
        }
        const params = yield* HttpRouter.params
        const id = params.id
        const wildcard = params["*"] ?? params[0] ?? ""
        if (!id || typeof wildcard !== "string") {
          return HttpServerResponse.empty({ status: 404 })
        }
        // Members need the module enabled+visible; admins can fetch covers for marketplace cards.
        const available = yield* modules.isAvailableToUser(user.value.id, id)
        if (!available && user.value.role !== "admin") {
          return HttpServerResponse.empty({ status: 404 })
        }

        const asset = yield* modules.resolveAsset(id, wildcard)
        if (!asset) return HttpServerResponse.empty({ status: 404 })

        const fileStat = yield* Effect.tryPromise({
          try: () => stat(asset.absolutePath),
          catch: () => null,
        })
        if (!fileStat || !fileStat.isFile()) {
          return HttpServerResponse.empty({ status: 404 })
        }

        const bytes = yield* Effect.tryPromise({
          try: () => readFile(asset.absolutePath),
          catch: () => null,
        })
        if (!bytes) return HttpServerResponse.empty({ status: 404 })

        return HttpServerResponse.uint8Array(bytes, {
          contentType: mimeFor(asset.absolutePath),
          headers: {
            "cache-control": "private, max-age=60",
          },
        })
      }).pipe(Effect.orDie),
    )

    yield* router.add(
      "*",
      "/api/m/:id/*",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const user = yield* auth.currentUser(new Headers(request.headers))
        if (Option.isNone(user)) {
          return HttpServerResponse.empty({ status: 401 })
        }
        const params = yield* HttpRouter.params
        const id = params.id
        const suffix = (params["*"] ?? "") as string
        if (!id) return HttpServerResponse.empty({ status: 404 })

        const ok = yield* modules.isAvailableToUser(user.value.id, id)
        if (!ok) return HttpServerResponse.empty({ status: 404 })

        const plugin = runtime.get(id)
        if (!plugin?.createHttpApp) {
          return HttpServerResponse.empty({ status: 404 })
        }

        const webRequest = yield* HttpServerRequest.toWeb(request)
        const response = yield* Effect.tryPromise({
          try: () =>
            Promise.resolve(
              plugin.createHttpApp!(webRequest, {
                moduleId: id,
                pathSuffix: suffix,
                rootDir: plugin.rootDir || join(modulesDir, id),
                ownerId: user.value.id,
              }),
            ),
          catch: () => null,
        })
        if (!response) return HttpServerResponse.empty({ status: 500 })
        return HttpServerResponse.fromWeb(response)
      }).pipe(Effect.orDie),
    )
  }),
).pipe(Layer.provide(ModulesServiceLive))
