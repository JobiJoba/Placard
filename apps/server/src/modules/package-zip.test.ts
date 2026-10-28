import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { strToU8, zipSync } from "fflate"
import { extractModuleZip } from "./package-zip.ts"

const validManifest = {
  id: "demo.plugin",
  name: "Demo",
  version: "0.1.0",
  description: "Fixture plugin",
  permissions: ["places.read"],
  nav: [{ path: "/m/demo.plugin", label: "Demo", slot: "more" }],
  source: "upload",
  sdkVersion: "0.1.0",
  webRoutes: [{ path: "/m/demo.plugin", exportName: "DemoPage" }],
}

const zipBase64 = (files: Record<string, string | Uint8Array>) => {
  const encoded: Record<string, Uint8Array> = {}
  for (const [path, data] of Object.entries(files)) {
    encoded[path] = typeof data === "string" ? strToU8(data) : data
  }
  return Buffer.from(zipSync(encoded)).toString("base64")
}

describe("extractModuleZip", () => {
  it.effect("extracts a valid package and writes .installed.json", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "placard-mod-")))
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => rm(root, { recursive: true, force: true })).pipe(Effect.asVoid),
      )

      const contentBase64 = zipBase64({
        "placard.module.json": JSON.stringify(validManifest),
        "server/index.js": "export function createModule() { return {} }\n",
        "web/index.js": "export const DemoPage = () => null\n",
      })

      const extracted = yield* extractModuleZip(contentBase64, root)
      expect(extracted.manifest.id).toBe("demo.plugin")
      expect(extracted.rootDir).toBe(join(root, "demo.plugin"))

      const installed = JSON.parse(
        yield* Effect.promise(() => readFile(join(extracted.rootDir, ".installed.json"), "utf8")),
      )
      expect(installed.sha256).toBe(extracted.sha256)
      expect(installed.version).toBe("0.1.0")
    }),
  )

  it.effect("rejects zip without placard.module.json", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "placard-mod-")))
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => rm(root, { recursive: true, force: true })).pipe(Effect.asVoid),
      )
      const contentBase64 = zipBase64({
        "server/index.js": "export function createModule() { return {} }\n",
      })
      const result = yield* extractModuleZip(contentBase64, root).pipe(Effect.result)
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") {
        expect(result.failure.message).toMatch(/placard\.module\.json/)
      }
    }),
  )

  it.effect("rejects zip-slip paths", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "placard-mod-")))
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => rm(root, { recursive: true, force: true })).pipe(Effect.asVoid),
      )
      const contentBase64 = zipBase64({
        "placard.module.json": JSON.stringify(validManifest),
        "server/index.js": "export function createModule() { return {} }\n",
        "../evil.js": "export {}\n",
      })
      const result = yield* extractModuleZip(contentBase64, root).pipe(Effect.result)
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") {
        expect(result.failure.message).toMatch(/unsafe path/)
      }
    }),
  )

  it.effect("rejects incompatible sdk major", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "placard-mod-")))
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => rm(root, { recursive: true, force: true })).pipe(Effect.asVoid),
      )
      const contentBase64 = zipBase64({
        "placard.module.json": JSON.stringify({ ...validManifest, sdkVersion: "9.0.0" }),
        "server/index.js": "export function createModule() { return {} }\n",
      })
      const result = yield* extractModuleZip(contentBase64, root).pipe(Effect.result)
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") {
        expect(result.failure.message).toMatch(/incompatible/)
      }
    }),
  )
})
