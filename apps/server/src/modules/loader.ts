import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import {
  defaultServerEntry,
  defaultWebEntry,
  type ModuleManifest as Manifest,
  ModuleManifest,
} from "@placard/module-sdk"
import { Context, Effect, Layer, Schema } from "effect"

export type PluginHttpHandler = (
  request: Request,
  ctx: {
    readonly moduleId: string
    readonly pathSuffix: string
    readonly rootDir: string
    readonly ownerId: string
  },
) => Promise<Response> | Response

export interface LoadedPlugin {
  readonly moduleId: string
  readonly rootDir: string
  readonly manifest: Manifest
  readonly createHttpApp?: PluginHttpHandler
}

type LoadResult = { ok: true } | { ok: false; error: string }

/** Process-wide registry so boot loadDiskModules and HTTP share one Map. */
const plugins = new Map<string, LoadedPlugin>()

const decodeManifest = (raw: string): Manifest | null => {
  try {
    const json = JSON.parse(raw) as unknown
    return Effect.runSync(Schema.decodeUnknownEffect(ModuleManifest)(json))
  } catch {
    return null
  }
}

export class ModuleRuntime extends Context.Service<
  ModuleRuntime,
  {
    readonly get: (moduleId: string) => LoadedPlugin | undefined
    readonly all: () => ReadonlyArray<LoadedPlugin>
    readonly register: (plugin: LoadedPlugin) => void
    readonly unregister: (moduleId: string) => void
    readonly loadFromDisk: (moduleId: string, rootDir: string) => Effect.Effect<LoadResult>
    readonly readManifest: (rootDir: string) => Effect.Effect<Manifest | null>
  }
>()("placard/ModuleRuntime") {
  static readonly layer = Layer.sync(ModuleRuntime, () => ({
    get: (moduleId) => plugins.get(moduleId),
    all: () => [...plugins.values()],
    register: (plugin) => {
      plugins.set(plugin.moduleId, plugin)
    },
    unregister: (moduleId) => {
      plugins.delete(moduleId)
    },

    readManifest: (rootDir) =>
      Effect.promise(async () => {
        try {
          const raw = await readFile(join(rootDir, "placard.module.json"), "utf8")
          return decodeManifest(raw)
        } catch {
          return null
        }
      }),

    loadFromDisk: (moduleId, rootDir) =>
      Effect.promise(async (): Promise<LoadResult> => {
        try {
          const raw = await readFile(join(rootDir, "placard.module.json"), "utf8")
          const manifest = decodeManifest(raw)
          if (!manifest) {
            return { ok: false, error: "Missing or invalid placard.module.json on disk." }
          }

          const serverEntry = (manifest.serverEntry ?? defaultServerEntry).replace(/^\.\//, "")
          const entryPath = join(rootDir, serverEntry)
          // Bust ESM cache so re-upload / on-disk patch reloads createModule.
          const href = `${pathToFileURL(entryPath).href}?t=${Date.now()}`

          let mod: Record<string, unknown>
          try {
            mod = (await import(href)) as Record<string, unknown>
          } catch (cause) {
            return {
              ok: false,
              error:
                cause instanceof Error
                  ? cause.message
                  : "Dynamic import of plugin server entry failed.",
            }
          }

          const createCandidate = mod.createModule
          const defaultExport = mod.default as { createModule?: unknown } | undefined
          const create =
            typeof createCandidate === "function"
              ? (createCandidate as () => { createHttpApp?: PluginHttpHandler })
              : typeof defaultExport?.createModule === "function"
                ? (defaultExport.createModule as () => { createHttpApp?: PluginHttpHandler })
                : null

          const created = create ? create() : {}
          const plugin: LoadedPlugin = {
            moduleId,
            rootDir,
            manifest: {
              ...manifest,
              serverEntry: manifest.serverEntry ?? defaultServerEntry,
              webEntry: manifest.webEntry ?? defaultWebEntry,
            },
            ...(created.createHttpApp ? { createHttpApp: created.createHttpApp } : {}),
          }
          plugins.set(moduleId, plugin)
          return { ok: true }
        } catch (cause) {
          return {
            ok: false,
            error: cause instanceof Error ? cause.message : "Failed to load plugin from disk.",
          }
        }
      }),
  }))
}

export const webEntryUrlFor = (moduleId: string, webEntry: string) => {
  const relative = webEntry.replace(/^\.\//, "")
  return `/api/modules/${encodeURIComponent(moduleId)}/assets/${relative}`
}
