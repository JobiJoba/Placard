import { join } from "node:path"
import { Effect, Layer } from "effect"
import { HttpPlatform, HttpRouter, HttpServerResponse, HttpStaticServer } from "effect/http"

export const webStaticLayer = (root: string) => {
  // Module IDs contain dots, so the generic SPA fallback mistakes them for files.
  const page = HttpServerResponse.file(join(root, "index.html"), {
    contentType: "text/html; charset=utf-8",
  })
  return Layer.mergeAll(
    HttpStaticServer.layer({ root, spa: true, index: "index.html" }),
    HttpRouter.use(
      Effect.fn(function* (router) {
        const platform = yield* HttpPlatform.HttpPlatform
        const handler = page.pipe(Effect.provideService(HttpPlatform.HttpPlatform, platform))
        yield* router.add("GET", "/m/:id/*", handler)
        yield* router.add("GET", "/settings/modules/:id", handler)
      }),
    ),
  )
}
