import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NodeHttpPlatform, NodeServices } from "@effect/platform-node"
import { Layer } from "effect"
import { HttpRouter } from "effect/http"
import { expect, it } from "vitest"
import { webStaticLayer } from "./static.ts"

it("serves dotted module deep links while preserving missing asset 404s", async () => {
  const root = await mkdtemp(join(tmpdir(), "placard-web-"))
  const html = "<!doctype html><title>Placard</title>"
  await writeFile(join(root, "index.html"), html)
  const app = HttpRouter.toWebHandler(
    webStaticLayer(root).pipe(
      Layer.provide(NodeHttpPlatform.layer),
      Layer.provide(NodeServices.layer),
    ),
    { disableLogger: true },
  )
  try {
    for (const path of [
      "/",
      "/lists",
      "/m/example.skeleton",
      "/m/example.skeleton/nested/page.v2?tab=1",
      "/settings/modules/example.skeleton",
    ]) {
      const response = await app.handler(
        new Request(`http://localhost${path}`, {
          headers: { accept: "text/html" },
        }),
      )
      expect(response.status, path).toBe(200)
      expect(response.headers.get("content-type")).toContain("text/html")
      expect(await response.text()).toBe(html)
    }
    for (const path of ["/assets/missing.js", "/api/modules/example.skeleton/assets/missing.js"]) {
      const response = await app.handler(
        new Request(`http://localhost${path}`, {
          headers: { accept: "text/html" },
        }),
      )
      expect(response.status, path).toBe(404)
    }
  } finally {
    await app.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
