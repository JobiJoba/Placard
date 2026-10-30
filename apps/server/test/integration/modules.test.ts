import { access } from "node:fs/promises"
import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { strToU8, zipSync } from "fflate"
import {
  clearGithubReleaseFixtures,
  githubReleaseFixtures,
} from "../../src/modules/github-fixture.ts"
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

  it.effect("catalog has no bundled Decide / empty preinstalled catalog", () =>
    run(async () => {
      const catalog = await admin.browser.get("/api/modules/catalog")
      expect(catalog.status).toBe(200)
      expect(
        catalog.body.find((m: { id: string }) => m.id === "restaurants.decide"),
      ).toBeUndefined()
      expect(catalog.body.filter((m: { source: string }) => m.source === "bundled")).toEqual([])
    }),
  )

  it.effect("upload prebuilt zip → me + assets + custom HTTP; hide / disable / uninstall", () =>
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
        updateAvailable: false,
        githubRepoUrl: null,
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

      const hidden = await admin.browser.send("PATCH", "/api/modules/me/demo.upload", {
        visible: false,
      })
      expect(hidden.status).toBe(200)
      expect(hidden.body.visible).toBe(false)
      expect(hidden.body.nav).toEqual([])
      expect((await admin.browser.send("GET", "/api/m/demo.upload/ping")).status).toBe(404)
      await admin.browser.send("PATCH", "/api/modules/me/demo.upload", { visible: true })

      const disabled = await admin.browser.send("PATCH", "/api/modules/installed/demo.upload", {
        enabled: false,
      })
      expect(disabled.status).toBe(200)
      expect(disabled.body.enabled).toBe(false)
      expect((await admin.browser.send("GET", "/api/m/demo.upload/ping")).status).toBe(404)
      await admin.browser.send("PATCH", "/api/modules/installed/demo.upload", { enabled: true })

      const gone = await admin.browser.send("DELETE", "/api/modules/installed/demo.upload")
      expect(gone.status).toBe(200)

      const meAfter = await admin.browser.get("/api/modules/me")
      expect(meAfter.body.find((m: { id: string }) => m.id === "demo.upload")).toBeUndefined()

      await expect(access("./data/test-modules/demo.upload")).rejects.toThrow()
    }),
  )

  it.effect("install from GitHub latest release, detect update, apply update", () =>
    run(async () => {
      clearGithubReleaseFixtures()

      const zipFor = (version: string) =>
        zipSync({
          "placard.module.json": strToU8(
            JSON.stringify({
              ...fixtureManifest,
              id: "demo.github",
              name: "GitHub Demo",
              version,
            }),
          ),
          "server/index.js": strToU8(`
export function createModule() {
  return {
    createHttpApp: async (_req, ctx) =>
      Response.json({ ok: true, path: ctx.pathSuffix, version: "${version}" }),
  }
}
`),
          "web/index.js": strToU8(`export const DemoPage = () => null\n`),
        })

      githubReleaseFixtures.set("acme/demo-plugin", {
        tagName: "v0.1.0",
        assetName: "demo.placard-module",
        zipBytes: zipFor("0.1.0"),
      })

      const installed = await admin.browser.send("POST", "/api/modules/from-github", {
        url: "https://github.com/Acme/demo-plugin",
      })
      expect(installed.status).toBe(200)
      expect(installed.body).toMatchObject({
        id: "demo.github",
        source: "github",
        version: "0.1.0",
        githubRepoUrl: "https://github.com/Acme/demo-plugin",
        updateAvailable: false,
      })

      githubReleaseFixtures.set("acme/demo-plugin", {
        tagName: "v0.2.0",
        assetName: "demo.placard-module",
        zipBytes: zipFor("0.2.0"),
      })

      const checked = await admin.browser.send("POST", "/api/modules/check-updates", {})
      expect(checked.status).toBe(200)
      expect(checked.body.updatesAvailable).toBeGreaterThanOrEqual(1)

      const listed = await admin.browser.get("/api/modules/installed")
      const row = listed.body.find((m: { id: string }) => m.id === "demo.github")
      expect(row).toMatchObject({
        updateAvailable: true,
        latestAvailableVersion: "0.2.0",
      })

      const updated = await admin.browser.send(
        "POST",
        "/api/modules/installed/demo.github/update",
        {},
      )
      expect(updated.status).toBe(200)
      expect(updated.body).toMatchObject({
        version: "0.2.0",
        updateAvailable: false,
      })

      const hours = await admin.browser.send("PATCH", "/api/admin/settings/module-update-check", {
        hours: 12,
      })
      expect(hours.status).toBe(200)
      expect(hours.body.moduleUpdateCheckHours).toBe(12)

      await admin.browser.send("DELETE", "/api/modules/installed/demo.github")
      clearGithubReleaseFixtures()
    }),
  )
})
