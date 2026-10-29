import { access } from "node:fs/promises"
import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { strToU8, zipSync } from "fflate"
import { type Browser, TestApp } from "../layers/app.ts"

const password = "correct horse battery"

const fixtureManifest = {
  id: "demo.upload",
  name: "Upload Demo",
  version: "0.1.0",
  description: "Integration fixture plugin",
  permissions: ["places.read"],
  nav: [{ path: "/m/demo.upload", label: "Demo", slot: "more" }],
  source: "upload",
  sdkVersion: "0.1.0",
  webRoutes: [{ path: "/m/demo.upload", exportName: "DemoPage" }],
}

const fixtureZipBase64 = () =>
  Buffer.from(
    zipSync({
      "placard.module.json": strToU8(JSON.stringify(fixtureManifest)),
      "server/index.js": strToU8(`
export function createModule() {
  return {
    createHttpApp: async (_req, ctx) =>
      Response.json({ ok: true, path: ctx.pathSuffix }),
  }
}
`),
      "web/index.js": strToU8(`export const DemoPage = () => null\n`),
      "web/assets/note.txt": strToU8("hello-plugin\n"),
    }),
  ).toString("base64")

const run = <A>(f: (app: TestApp["Service"]) => Promise<A>) =>
  Effect.gen(function* () {
    const app = yield* TestApp
    return yield* Effect.promise(() => f(app))
  })

layer(TestApp.layer, { concurrent: false, timeout: 120_000 })("modules marketplace", (it) => {
  const admin = { browser: undefined as unknown as Browser }

  it.effect("setup: sign up admin", () =>
    run(async (app) => {
      admin.browser = app.browser()
      const signed = await admin.browser.send("POST", "/api/auth/sign-up/email", {
        name: "Alice",
        email: "modules@example.com",
        password,
      })
      expect(signed.status).toBe(200)
    }),
  )

  it.effect("catalog lists Decide as installed by seed migration", () =>
    run(async () => {
      const catalog = await admin.browser.get("/api/modules/catalog")
      expect(catalog.status).toBe(200)
      const decide = catalog.body.find((m: { id: string }) => m.id === "restaurants.decide")
      expect(decide).toMatchObject({
        id: "restaurants.decide",
        installed: true,
        source: "bundled",
        coverUrl: "/module-covers/decide.svg",
        iconUrl: "/module-covers/decide.svg",
      })
    }),
  )

  it.effect("me includes Decide nav when visible", () =>
    run(async () => {
      const me = await admin.browser.get("/api/modules/me")
      expect(me.status).toBe(200)
      const decide = me.body.find((m: { id: string }) => m.id === "restaurants.decide")
      expect(decide.visible).toBe(true)
      expect(decide.nav[0].path).toBe("/m/restaurants.decide")
    }),
  )

  it.effect("hiding Decide removes nav and blocks spin", () =>
    run(async () => {
      const hidden = await admin.browser.send("PATCH", "/api/modules/me/restaurants.decide", {
        visible: false,
      })
      expect(hidden.status).toBe(200)
      expect(hidden.body.visible).toBe(false)
      expect(hidden.body.nav).toEqual([])

      const me = await admin.browser.get("/api/modules/me")
      const decide = me.body.find((m: { id: string }) => m.id === "restaurants.decide")
      expect(decide.nav).toEqual([])

      const spun = await admin.browser.send("POST", "/api/m/restaurants.decide/spin", {
        avoidRecent: false,
      })
      expect(spun.status).toBe(404)

      await admin.browser.send("PATCH", "/api/modules/me/restaurants.decide", { visible: true })
    }),
  )

  it.effect("admin can disable for the whole instance", () =>
    run(async () => {
      const disabled = await admin.browser.send(
        "PATCH",
        "/api/modules/installed/restaurants.decide",
        { enabled: false },
      )
      expect(disabled.status).toBe(200)
      expect(disabled.body.enabled).toBe(false)

      const spun = await admin.browser.send("POST", "/api/m/restaurants.decide/spin", {
        avoidRecent: false,
      })
      expect(spun.status).toBe(404)

      await admin.browser.send("PATCH", "/api/modules/installed/restaurants.decide", {
        enabled: true,
      })
    }),
  )

  it.effect("uninstall then reinstall Decide", () =>
    run(async () => {
      const gone = await admin.browser.send("DELETE", "/api/modules/installed/restaurants.decide")
      expect(gone.status).toBe(200)

      const me = await admin.browser.get("/api/modules/me")
      expect(me.body.find((m: { id: string }) => m.id === "restaurants.decide")).toBeUndefined()

      const again = await admin.browser.send("POST", "/api/modules/install", {
        moduleId: "restaurants.decide",
      })
      expect(again.status).toBe(200)
      expect(again.body.id).toBe("restaurants.decide")
    }),
  )

  it.effect("upload prebuilt zip → me + assets + custom HTTP; uninstall removes dir", () =>
    run(async () => {
      const uploaded = await admin.browser.send("POST", "/api/modules/upload", {
        filename: "demo.upload.zip",
        contentBase64: fixtureZipBase64(),
      })
      expect(uploaded.status).toBe(200)
      expect(uploaded.body).toMatchObject({
        id: "demo.upload",
        source: "upload",
        enabled: true,
      })
      expect(uploaded.body.loadError).toBeNull()

      const me = await admin.browser.get("/api/modules/me")
      const demo = me.body.find((m: { id: string }) => m.id === "demo.upload")
      expect(demo).toMatchObject({
        visible: true,
        webEntryUrl: "/api/modules/demo.upload/assets/web/index.js",
      })
      expect(demo.nav[0].path).toBe("/m/demo.upload")

      const asset = await admin.browser.getRaw(
        "/api/modules/demo.upload/assets/web/assets/note.txt",
      )
      expect(asset.status).toBe(200)
      expect(new TextDecoder().decode(asset.body)).toContain("hello-plugin")

      const custom = await admin.browser.send("GET", "/api/m/demo.upload/ping")
      expect(custom.status).toBe(200)
      expect(custom.body).toMatchObject({ ok: true, path: "ping" })

      const gone = await admin.browser.send("DELETE", "/api/modules/installed/demo.upload")
      expect(gone.status).toBe(200)

      const meAfter = await admin.browser.get("/api/modules/me")
      expect(meAfter.body.find((m: { id: string }) => m.id === "demo.upload")).toBeUndefined()

      await expect(access("./data/test-modules/demo.upload")).rejects.toThrow()
    }),
  )
})
