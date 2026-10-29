import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import {
  type CreateModuleResult,
  defaultServerEntry,
  defaultWebEntry,
  type ModuleManifest as Manifest,
  ModuleManifest,
  type ModuleMcpTool,
} from "@placard/module-sdk"
import { Context, Effect, Layer, Schema } from "effect"

export type PluginHttpHandler = NonNullable<CreateModuleResult["createHttpApp"]>

export interface LoadedPlugin {
  readonly moduleId: string
  readonly rootDir: string
  readonly manifest: Manifest
  readonly createHttpApp?: PluginHttpHandler
  readonly mcpTools?: ReadonlyArray<ModuleMcpTool>
}

type LoadResult = { ok: true } | { ok: false; error: string }

/** Process-wide registry so boot loadDiskModules and HTTP share one Map. */
const plugins = new Map<string, LoadedPlugin>()

/** In-process fetch for plugin hostFetch (tests set this; production uses global fetch). */
let hostFetchImpl: typeof globalThis.fetch = globalThis.fetch.bind(globalThis)

const decodeManifest = (raw: string): Manifest | null => {
  try {
    const json = JSON.parse(raw) as unknown
    return Effect.runSync(Schema.decodeUnknownEffect(ModuleManifest)(json))
  } catch {
    return null
  }
}

const createdFromModule = (mod: Record<string, unknown>): CreateModuleResult => {
  const createCandidate = mod.createModule
  const defaultExport = mod.default as { createModule?: unknown } | undefined
  const create =
    typeof createCandidate === "function"
      ? (createCandidate as () => CreateModuleResult)
      : typeof defaultExport?.createModule === "function"
        ? (defaultExport.createModule as () => CreateModuleResult)
        : null
  return create ? create() : {}
}

const toLoaded = (
  moduleId: string,
  rootDir: string,
  manifest: Manifest,
  created: CreateModuleResult,
): LoadedPlugin => ({
  moduleId,
  rootDir,
  manifest: {
    ...manifest,
    serverEntry: manifest.serverEntry ?? defaultServerEntry,
    webEntry: manifest.webEntry ?? defaultWebEntry,
  },
  ...(created.createHttpApp ? { createHttpApp: created.createHttpApp } : {}),
  ...(created.mcpTools && created.mcpTools.length > 0 ? { mcpTools: created.mcpTools } : {}),
})

export class ModuleRuntime extends Context.Service<
  ModuleRuntime,
  {
    readonly get: (moduleId: string) => LoadedPlugin | undefined
    readonly all: () => ReadonlyArray<LoadedPlugin>
    readonly register: (plugin: LoadedPlugin) => void
    readonly unregister: (moduleId: string) => void
    readonly loadFromDisk: (moduleId: string, rootDir: string) => Effect.Effect<LoadResult>
    readonly loadFromCreateModule: (
      moduleId: string,
      rootDir: string,
      manifest: Manifest,
      importHref: string,
    ) => Effect.Effect<LoadResult>
    readonly readManifest: (rootDir: string) => Effect.Effect<Manifest | null>
    readonly setHostFetch: (fetchImpl: typeof globalThis.fetch) => void
    readonly hostFetch: typeof globalThis.fetch
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

    setHostFetch: (fetchImpl) => {
      hostFetchImpl = fetchImpl
    },
    hostFetch: ((input, init) => hostFetchImpl(input, init)) as typeof globalThis.fetch,

    readManifest: (rootDir) =>
      Effect.promise(async () => {
        try {
          const { readFile } = await import("node:fs/promises")
          const raw = await readFile(join(rootDir, "placard.module.json"), "utf8")
          return decodeManifest(raw)
        } catch {
          return null
        }
      }),

    loadFromCreateModule: (moduleId, rootDir, manifest, importHref) =>
      Effect.promise(async (): Promise<LoadResult> => {
        try {
          await mkdir(rootDir, { recursive: true })
          const href = `${importHref}${importHref.includes("?") ? "&" : "?"}t=${Date.now()}`
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
          const created = createdFromModule(mod)
          plugins.set(moduleId, toLoaded(moduleId, rootDir, manifest, created))
          return { ok: true }
        } catch (cause) {
          return {
            ok: false,
            error: cause instanceof Error ? cause.message : "Failed to load plugin module.",
          }
        }
      }),

    loadFromDisk: (moduleId, rootDir) =>
      Effect.promise(async (): Promise<LoadResult> => {
        try {
          const { readFile } = await import("node:fs/promises")
          const raw = await readFile(join(rootDir, "placard.module.json"), "utf8")
          const manifest = decodeManifest(raw)
          if (!manifest) {
            return { ok: false, error: "Missing or invalid placard.module.json on disk." }
          }

          const serverEntry = (manifest.serverEntry ?? defaultServerEntry).replace(/^\.\//, "")
          const entryPath = join(rootDir, serverEntry)
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

          const created = createdFromModule(mod)
          plugins.set(moduleId, toLoaded(moduleId, rootDir, manifest, created))
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

/** Test/boot helper — same mutable host fetch the ModuleRuntime service exposes. */
export const setModuleHostFetch = (fetchImpl: typeof globalThis.fetch) => {
  hostFetchImpl = fetchImpl
}
