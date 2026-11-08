import { access, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { expect, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { strToU8, zipSync } from "fflate"
import { AppConfig } from "../../src/config.ts"
import {
  clearGithubReleaseFixtures,
  githubReleaseFixtures,
  TestHttpFixtureClient,
} from "../../src/modules/github-fixture.ts"
import { ModuleRuntime } from "../../src/modules/loader.ts"
import { Modules } from "../../src/modules/modules.ts"
import { type Browser, TestApp } from "../layers/app.ts"

const password = "correct horse battery"

const fixtureManifest = {
  id: "demo.upload",
  name: "Upload Demo",
  version: "0.1.0",
  description: "Integration fixture plugin",
  permissions: ["places.read"],
  nav: [{ path: "/m/demo.upload", label: "Demo", slot: "more", mobileIcon: "dices" }],
  source: "upload",
  icon: "web/assets/icon.svg",
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
      "web/assets/icon.svg": strToU8('<svg xmlns="http://www.w3.org/2000/svg"/>'),
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

  it.effect("catalog includes five inactive official plugins", () =>
    run(async () => {
      const catalog = await admin.browser.get("/api/modules/catalog")
      expect(catalog.status).toBe(200)
      expect(
        catalog.body.find((m: { id: string }) => m.id === "restaurants.decide"),
      ).toBeUndefined()
      expect(catalog.body.filter((m: { source: string }) => m.source === "bundled")).toHaveLength(5)
      const installed = await admin.browser.get("/api/modules/installed")
      expect(installed.body.every((m: { enabled: boolean }) => !m.enabled)).toBe(true)
    }),
  )

  it.effect("activates and deactivates every bundled plugin without restart", () =>
    run(async () => {
      const catalog = await admin.browser.get("/api/modules/catalog")
      for (const plugin of catalog.body) {
        expect(plugin.coverUrl ?? plugin.iconUrl).toBeTruthy()
        const artwork = await admin.browser.getRaw(plugin.coverUrl ?? plugin.iconUrl)
        expect(artwork.status).toBe(200)
        const activated = await admin.browser.send("PATCH", `/api/modules/installed/${plugin.id}`, {
          enabled: true,
        })
        expect(activated.status, JSON.stringify(activated.body)).toBe(200)
        expect(activated.body.loadError).toBeNull()
        const mine = await admin.browser.get("/api/modules/me")
        expect(mine.body.find((m: { id: string }) => m.id === plugin.id).webEntryUrl).toBeTruthy()
        const deactivated = await admin.browser.send(
          "PATCH",
          `/api/modules/installed/${plugin.id}`,
          { enabled: false },
        )
        expect(deactivated.status).toBe(200)
        const after = await admin.browser.get("/api/modules/me")
        expect(after.body.some((m: { id: string }) => m.id === plugin.id)).toBe(false)
      }
    }),
  )

  it.effect(
    "members can browse inactive artwork but cannot activate or fetch executable assets",
    () =>
      run(async (app) => {
        const invite = await admin.browser.send("POST", "/api/admin/invites", {
          email: "market-member@example.com",
        })
        const member = app.browser()
        const signup = await member.send("POST", "/api/auth/sign-up/email", {
          name: "Member",
          email: "market-member@example.com",
          password,
          inviteToken: new URL(invite.body.url).pathname.split("/").pop(),
        })
        expect(signup.status).toBe(200)
        const catalog = await member.get("/api/modules/catalog")
        expect(catalog.status).toBe(200)
        for (const plugin of catalog.body) {
          expect((await member.getRaw(plugin.coverUrl ?? plugin.iconUrl)).status).toBe(200)
          expect(
            (await member.getRaw(`/api/modules/${plugin.id}/assets/web/index.js`)).status,
          ).toBe(404)
          expect(
            (await member.send("PATCH", `/api/modules/installed/${plugin.id}`, { enabled: true }))
              .status,
          ).not.toBe(200)
        }
      }),
  )

  it.effect("a failed activation stays inactive and can be retried after repair", () =>
    Effect.gen(function* () {
      const config = yield* AppConfig
      yield* run(async () => {
        const broken = { ...fixtureManifest, id: "demo.broken" }
        const zip = Buffer.from(
          zipSync({
            "placard.module.json": strToU8(JSON.stringify(broken)),
            "server/index.js": strToU8("throw new Error('broken plugin')"),
            "web/index.js": strToU8("export const DemoPage = () => null"),
          }),
        ).toString("base64")
        await admin.browser.send("POST", "/api/modules/upload", {
          filename: "broken.zip",
          contentBase64: zip,
        })
        const failed = await admin.browser.send("PATCH", "/api/modules/installed/demo.broken", {
          enabled: true,
        })
        expect(failed.status).not.toBe(200)
        const installed = await admin.browser.get("/api/modules/installed")
        expect(installed.body.find((m: { id: string }) => m.id === broken.id)).toMatchObject({
          enabled: false,
          loadError: "broken plugin",
        })
        await writeFile(
          join(config.modulesDir, broken.id, "server/index.js"),
          "export function createModule() { return {} }",
        )
        const retry = await admin.browser.send("PATCH", "/api/modules/installed/demo.broken", {
          enabled: true,
        })
        expect(retry.status, JSON.stringify(retry.body)).toBe(200)
        expect(retry.body).toMatchObject({ enabled: true, loadError: null })
        await admin.browser.send("DELETE", "/api/modules/installed/demo.broken")
      })
    }),
  )

  it.effect("boot preserves existing versions, sources, enabled state and preferences", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`update instance_modules set source = 'github', version = '0.0.9', enabled = true where module_id = 'places.pick'`
      yield* run(async () => {
        await admin.browser.send("PATCH", "/api/modules/me/places.pick", { visible: false })
      })
      yield* Effect.gen(function* () {
        const modules = yield* Modules
        yield* modules.loadDiskModules
      }).pipe(
        Effect.provide(
          Modules.layer.pipe(
            Layer.provide(ModuleRuntime.layer),
            Layer.provide(TestHttpFixtureClient),
          ),
        ),
      )
      yield* run(async () => {
        const installed = await admin.browser.get("/api/modules/installed")
        expect(installed.body.find((m: { id: string }) => m.id === "places.pick")).toMatchObject({
          source: "github",
          version: "0.0.9",
          enabled: true,
        })
        const mine = await admin.browser.get("/api/modules/me")
        expect(mine.body.find((m: { id: string }) => m.id === "places.pick").visible).toBe(false)
        await admin.browser.send("PATCH", "/api/modules/installed/places.pick", { enabled: false })
      })
      yield* sql`update instance_modules set source = 'bundled' where module_id = 'places.pick'`
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
        iconUrl: "/api/modules/demo.upload/assets/web/assets/icon.svg",
        webEntryUrl: "/api/modules/demo.upload/assets/web/index.js",
      })
      expect(demo.nav[0].path).toBe("/m/demo.upload")
      expect(demo.nav[0].mobileIcon).toBe("dices")

      const icon = await admin.browser.getRaw(demo.iconUrl)
      expect(icon.status).toBe(200)
      expect(new TextDecoder().decode(icon.body)).toContain("<svg")

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

  it.effect("monorepo installs and updates keep module release streams separate", () =>
    run(async () => {
      const fixture = (id: string, version: string, actualId = id) => ({
        tagName: `${id}@${version}`,
        assetName: `${id}.placard-module`,
        zipBytes: zipSync({
          "placard.module.json": strToU8(
            JSON.stringify({ ...fixtureManifest, id: actualId, version, nav: [], webRoutes: [] }),
          ),
          "server/index.js": strToU8("export function createModule() { return {} }"),
          "web/index.js": strToU8("export {}"),
        }),
      })
      githubReleaseFixtures.set("acme/plugins#places.menus", fixture("places.menus", "0.1.0"))
      githubReleaseFixtures.set("acme/plugins#places.pick", fixture("places.pick", "0.1.1"))
      for (const id of ["places.menus", "places.pick"]) {
        const installed = await admin.browser.send("POST", "/api/modules/from-github", {
          url: `Acme/plugins#${id}`,
        })
        expect(installed.status).toBe(200)
        expect(installed.body).toMatchObject({
          id,
          githubRepoUrl: `https://github.com/Acme/plugins#${id}`,
        })
      }
      githubReleaseFixtures.set("acme/plugins#places.menus", fixture("places.menus", "0.2.0"))
      expect((await admin.browser.send("POST", "/api/modules/check-updates", {})).status).toBe(200)
      const listed = await admin.browser.get("/api/modules/installed")
      expect(listed.body.find((m: { id: string }) => m.id === "places.menus")).toMatchObject({
        updateAvailable: true,
        latestAvailableVersion: "0.2.0",
      })
      expect(listed.body.find((m: { id: string }) => m.id === "places.pick")).toMatchObject({
        updateAvailable: false,
        version: "0.1.1",
      })
      const updated = await admin.browser.send(
        "POST",
        "/api/modules/installed/places.menus/update",
        {},
      )
      expect(updated.status).toBe(200)
      expect(updated.body).toMatchObject({ id: "places.menus", version: "0.2.0" })
      githubReleaseFixtures.set(
        "acme/plugins#places.menus",
        fixture("places.menus", "0.3.0", "places.pick"),
      )
      const wrong = await admin.browser.send(
        "POST",
        "/api/modules/installed/places.menus/update",
        {},
      )
      expect(wrong.status).toBe(400)
      expect(wrong.body.message).toContain("expected places.menus")
      for (const id of ["places.menus", "places.pick"])
        await admin.browser.send("DELETE", `/api/modules/installed/${id}`)
      clearGithubReleaseFixtures()
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
