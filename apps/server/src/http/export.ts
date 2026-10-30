import { Effect, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { Auth } from "../auth/auth.ts"
import { LibraryExport } from "../export/export.ts"

/** Authenticated library download: JSON + GeoJSON + media as a zip. */
export const ExportRoutesLive = HttpRouter.use(
  Effect.fn(function* (router) {
    const auth = yield* Auth
    const libraryExport = yield* LibraryExport

    yield* router.add(
      "GET",
      "/api/export",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const user = yield* auth.currentUser(new Headers(request.headers))
        if (Option.isNone(user)) {
          return HttpServerResponse.empty({ status: 401 })
        }
        const zip = yield* libraryExport.buildZip({
          ...user.value,
          image: null,
          householdEnabled: false,
        })
        return HttpServerResponse.uint8Array(zip, {
          contentType: "application/zip",
          headers: {
            "content-disposition": 'attachment; filename="placard-export.zip"',
            "cache-control": "no-store",
          },
        })
      }).pipe(Effect.orDie),
    )
  }),
)
