import { createHash } from "node:crypto"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join, normalize, resolve, sep } from "node:path"
import { ModuleInstallFailed } from "@placard/domain"
import {
  defaultServerEntry,
  defaultWebEntry,
  ModuleManifest,
  sdkMajorCompatible,
} from "@placard/module-sdk"
import { Effect, Schema } from "effect"
import { unzipSync } from "fflate"

const MAX_ZIP_BYTES = 25 * 1024 * 1024
const MAX_UNCOMPRESSED_BYTES = 80 * 1024 * 1024
const MAX_FILES = 2_000

export interface ExtractedPackage {
  readonly manifest: typeof ModuleManifest.Type
  readonly sha256: string
  readonly rootDir: string
}

const fail = (message: string) => new ModuleInstallFailed({ message })

const isSafeZipPath = (entry: string): boolean => {
  if (entry === "" || entry.endsWith("/")) return false
  if (entry.includes("\0")) return false
  const normalized = normalize(entry).replace(/\\/g, "/")
  if (normalized.startsWith("/") || normalized.includes("..")) return false
  if (/^[a-zA-Z]:/.test(normalized) || normalized.startsWith("//")) return false
  return true
}

const ensureInside = (root: string, target: string) => {
  const resolvedRoot = resolve(root) + sep
  const resolvedTarget = resolve(target)
  if (!resolvedTarget.startsWith(resolvedRoot) && resolvedTarget !== resolve(root)) {
    throw new Error("zip slip")
  }
}

/** Decode and unzip a prebuilt plugin package into `destRoot/<moduleId>/`. */
export const extractModuleZip = (
  contentBase64: string,
  destRoot: string,
): Effect.Effect<ExtractedPackage, ModuleInstallFailed> =>
  Effect.gen(function* () {
    let bytes: Buffer
    try {
      bytes = Buffer.from(contentBase64, "base64")
    } catch {
      return yield* fail("Plugin zip is not valid base64.")
    }
    if (bytes.byteLength === 0) return yield* fail("Plugin zip is empty.")
    if (bytes.byteLength > MAX_ZIP_BYTES) {
      return yield* fail(`Plugin zip is too large (max ${MAX_ZIP_BYTES / (1024 * 1024)} MB).`)
    }

    const sha256 = createHash("sha256").update(bytes).digest("hex")

    let unzipped: Record<string, Uint8Array>
    try {
      unzipped = unzipSync(bytes)
    } catch {
      return yield* fail("Could not read the plugin zip.")
    }

    const entries = Object.entries(unzipped).filter(([path]) => !path.endsWith("/"))
    if (entries.length === 0) return yield* fail("Plugin zip has no files.")
    if (entries.length > MAX_FILES) return yield* fail("Plugin zip has too many files.")

    let total = 0
    for (const [path, data] of entries) {
      if (!isSafeZipPath(path)) {
        return yield* fail(`Plugin zip contains an unsafe path: ${path}`)
      }
      total += data.byteLength
      if (total > MAX_UNCOMPRESSED_BYTES) {
        return yield* fail("Plugin zip expands to too many bytes.")
      }
    }

    const manifestEntry = entries.find(([path]) => path === "placard.module.json")
    if (!manifestEntry) {
      return yield* fail("Plugin zip must contain placard.module.json at the archive root.")
    }

    let manifestJson: unknown
    try {
      manifestJson = JSON.parse(Buffer.from(manifestEntry[1]).toString("utf8"))
    } catch {
      return yield* fail("placard.module.json is not valid JSON.")
    }

    const decoded = yield* Schema.decodeUnknownEffect(ModuleManifest)(manifestJson).pipe(
      Effect.mapError(() =>
        fail("placard.module.json does not match the Placard module manifest schema."),
      ),
    )

    if (!sdkMajorCompatible(decoded.sdkVersion)) {
      return yield* fail(
        `Plugin sdkVersion ${decoded.sdkVersion ?? "(missing)"} is incompatible with this Placard host.`,
      )
    }

    const serverEntry = decoded.serverEntry ?? defaultServerEntry
    const webEntry = decoded.webEntry ?? defaultWebEntry
    const serverKey = serverEntry.replace(/^\.\//, "")
    if (!entries.some(([path]) => path === serverKey)) {
      return yield* fail(`Plugin zip is missing server entry ${serverEntry}.`)
    }

    const moduleId = decoded.id
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(moduleId)) {
      return yield* fail("Module id is not a safe directory name.")
    }

    const finalDir = join(destRoot, moduleId)
    const staging = join(destRoot, `.staging-${moduleId}-${Date.now()}`)

    yield* Effect.tryPromise({
      try: async () => {
        await mkdir(staging, { recursive: true })
        for (const [path, data] of entries) {
          const target = join(staging, path)
          ensureInside(staging, target)
          await mkdir(dirname(target), { recursive: true })
          await writeFile(target, data)
        }
        await writeFile(
          join(staging, ".installed.json"),
          JSON.stringify(
            {
              version: decoded.version,
              uploadedAt: new Date().toISOString(),
              sha256,
              serverEntry,
              webEntry,
            },
            null,
            2,
          ),
        )
        await rm(finalDir, { recursive: true, force: true })
        await mkdir(dirname(finalDir), { recursive: true })
        await rename(staging, finalDir)
      },
      catch: (error) => {
        void rm(staging, { recursive: true, force: true }).catch(() => undefined)
        return fail(error instanceof Error ? error.message : "Could not install the plugin zip.")
      },
    })

    return {
      manifest: {
        ...decoded,
        source: "upload" as const,
        serverEntry,
        webEntry,
      },
      sha256,
      rootDir: finalDir,
    }
  })

export const removeModuleDir = (destRoot: string, moduleId: string): Effect.Effect<void> =>
  Effect.promise(() =>
    rm(join(destRoot, moduleId), { recursive: true, force: true }).catch(() => undefined),
  ).pipe(Effect.asVoid)
