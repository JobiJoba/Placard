import { join } from "node:path"
import {
  type CatalogModule,
  type InstalledModule,
  ModuleInstallFailed,
  ModuleNotFound,
  type ModuleSource,
  type ModuleUpload,
  type MyModule,
} from "@placard/domain"
import { defaultWebEntry, type ModuleManifest, moduleMcpToolName } from "@placard/module-sdk"
import { Context, DateTime, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { AppConfig } from "../config.ts"
import { allCatalogManifests, catalogManifest } from "./catalog.ts"
import { ModuleRuntime, webEntryUrlFor } from "./loader.ts"
import { extractModuleZip, removeModuleDir } from "./package-zip.ts"

/** Resolve bundled plugin server entry for dynamic import (same contract as upload). */
const bundledPluginImportHref = (packageName: string): string | null => {
  try {
    return import.meta.resolve(`${packageName}/plugin-server`)
  } catch {
    return null
  }
}

interface InstanceRow {
  readonly module_id: string
  readonly version: string
  readonly source: ModuleSource
  readonly package_name: string | null
  readonly enabled: boolean
  readonly load_error: string | null
  readonly installed_at: Date
}

/** Resolve manifest icon/cover to a browser URL (or null). */
export const resolveModuleMediaUrl = (
  moduleId: string,
  source: ModuleSource,
  media: string | undefined,
): string | null => {
  if (media == null || media.trim() === "") return null
  const value = media.trim()
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) return value
  if (source === "upload" || source === "folder") {
    const relative = value.replace(/^\.\//, "")
    return `/api/modules/${encodeURIComponent(moduleId)}/assets/${relative}`
  }
  // Bundled relative paths are not served from disk; prefer absolute /public paths in manifests.
  return null
}

const toInstalled = (
  row: InstanceRow,
  meta: {
    name: string
    description: string
    iconUrl: string | null
    coverUrl: string | null
  },
): InstalledModule => ({
  id: row.module_id,
  name: meta.name,
  version: row.version,
  description: meta.description,
  source: row.source,
  packageName: row.package_name,
  enabled: row.enabled,
  installedAt: DateTime.fromDateUnsafe(row.installed_at),
  loadError: row.load_error,
  iconUrl: meta.iconUrl,
  coverUrl: meta.coverUrl,
})

export class Modules extends Context.Service<
  Modules,
  {
    readonly catalog: (ownerId: string) => Effect.Effect<ReadonlyArray<CatalogModule>>
    readonly installed: Effect.Effect<ReadonlyArray<InstalledModule>>
    readonly install: (
      actorRole: "admin" | "member",
      moduleId: string,
    ) => Effect.Effect<InstalledModule, ModuleNotFound | ModuleInstallFailed>
    readonly upload: (
      actorRole: "admin" | "member",
      upload: ModuleUpload,
    ) => Effect.Effect<InstalledModule, ModuleInstallFailed>
    readonly uninstall: (
      actorRole: "admin" | "member",
      moduleId: string,
    ) => Effect.Effect<void, ModuleNotFound | ModuleInstallFailed>
    readonly setEnabled: (
      actorRole: "admin" | "member",
      moduleId: string,
      enabled: boolean,
    ) => Effect.Effect<InstalledModule, ModuleNotFound>
    readonly me: (ownerId: string) => Effect.Effect<ReadonlyArray<MyModule>>
    readonly setVisible: (
      ownerId: string,
      moduleId: string,
      visible: boolean,
    ) => Effect.Effect<MyModule, ModuleNotFound>
    readonly setMcpEnabled: (
      ownerId: string,
      moduleId: string,
      enabled: boolean,
    ) => Effect.Effect<MyModule, ModuleNotFound>
    readonly isAvailableToUser: (ownerId: string, moduleId: string) => Effect.Effect<boolean>
    /** Whether module MCP tools should register for this user. */
    readonly isMcpEnabledForUser: (ownerId: string, moduleId: string) => Effect.Effect<boolean>
    /** Load all enabled disk/bundled modules after migrate. */
    readonly loadDiskModules: Effect.Effect<void>
    readonly resolveAsset: (
      moduleId: string,
      relativePath: string,
    ) => Effect.Effect<{ absolutePath: string; rootDir: string } | null>
  }
>()("placard/Modules") {
  static readonly layer = Layer.effect(
    Modules,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const config = yield* AppConfig
      const runtime = yield* ModuleRuntime
      const modulesDir = config.modulesDir

      const requireAdmin = (role: "admin" | "member") =>
        role === "admin"
          ? Effect.void
          : Effect.fail(
              new ModuleInstallFailed({ message: "Only an admin can install or remove modules." }),
            )

      const getRow = (moduleId: string) =>
        sql<InstanceRow>`
          select module_id, version, source, package_name, enabled, load_error, installed_at
          from instance_modules where module_id = ${moduleId}`.pipe(
          Effect.map((rows) => rows[0]),
          Effect.orDie,
        )

      const listRows = () =>
        sql<InstanceRow>`
          select module_id, version, source, package_name, enabled, load_error, installed_at
          from instance_modules
          order by installed_at, module_id`.pipe(Effect.orDie)

      const resolveManifest = (row: InstanceRow): Effect.Effect<ModuleManifest | null> =>
        Effect.gen(function* () {
          const bundled = catalogManifest(row.module_id)
          if (bundled) return bundled
          if (row.source === "upload" || row.source === "folder") {
            const loaded = runtime.get(row.module_id)
            if (loaded) return loaded.manifest
            return yield* runtime.readManifest(join(modulesDir, row.module_id))
          }
          return null
        })

      const metaFor = (moduleId: string, row?: InstanceRow) =>
        Effect.gen(function* () {
          const effectiveRow = row ?? {
            module_id: moduleId,
            version: "0.0.0",
            source: "bundled" as const,
            package_name: null,
            enabled: true,
            load_error: null,
            installed_at: new Date(),
          }
          const m = yield* resolveManifest(effectiveRow)
          if (!m) {
            return {
              name: moduleId,
              description: "",
              version: effectiveRow.version,
              iconUrl: null as string | null,
              coverUrl: null as string | null,
            }
          }
          return {
            name: m.name,
            description: m.description,
            version: m.version,
            iconUrl: resolveModuleMediaUrl(moduleId, effectiveRow.source, m.icon),
            coverUrl: resolveModuleMediaUrl(moduleId, effectiveRow.source, m.cover),
          }
        })

      const mediaMeta = (m: ModuleManifest, source: ModuleSource) => ({
        name: m.name,
        description: m.description,
        iconUrl: resolveModuleMediaUrl(m.id, source, m.icon),
        coverUrl: resolveModuleMediaUrl(m.id, source, m.cover),
      })

      const catalogEntry = (
        m: ModuleManifest,
        source: ModuleSource,
        installed: boolean,
      ): CatalogModule => ({
        id: m.id,
        name: m.name,
        version: m.version,
        description: m.description,
        source,
        packageName: m.packageName ?? null,
        installed,
        permissions: [...m.permissions],
        iconUrl: resolveModuleMediaUrl(m.id, source, m.icon),
        coverUrl: resolveModuleMediaUrl(m.id, source, m.cover),
      })

      const setLoadError = (moduleId: string, error: string | null) =>
        sql`
          update instance_modules set load_error = ${error}
          where module_id = ${moduleId}`.pipe(Effect.orDie, Effect.asVoid)

      const upsertInstalled = (
        manifest: ModuleManifest,
        source: ModuleSource,
        loadError: string | null,
      ) =>
        sql<InstanceRow>`
          insert into instance_modules (
            module_id, version, source, package_name, enabled, load_error
          ) values (
            ${manifest.id}, ${manifest.version}, ${source},
            ${manifest.packageName ?? null}, true, ${loadError}
          )
          on conflict (module_id) do update set
            version = excluded.version,
            source = excluded.source,
            package_name = excluded.package_name,
            enabled = true,
            load_error = excluded.load_error,
            installed_at = now()
          returning module_id, version, source, package_name, enabled, load_error, installed_at`.pipe(
          Effect.orDie,
        )

      const mcpToolInfos = (manifest: ModuleManifest, moduleId: string) => {
        const toInfo = (localName: string, title: string | undefined, description: string) => ({
          name: moduleMcpToolName(moduleId, localName),
          localName,
          ...(title !== undefined ? { title } : {}),
          description,
        })
        const fromManifest = manifest.mcpTools ?? []
        if (fromManifest.length > 0) {
          return fromManifest.map((t) => toInfo(t.name, t.title, t.description))
        }
        const loaded = runtime.get(moduleId)
        return (loaded?.mcpTools ?? []).map((t) =>
          toInfo(t.def.name, t.def.title, t.def.description),
        )
      }

      const toMyModule = (
        row: InstanceRow,
        manifest: ModuleManifest,
        visible: boolean,
        mcpEnabled: boolean,
      ): MyModule => {
        const disk = row.source === "upload" || row.source === "folder"
        const webEntry = manifest.webEntry ?? defaultWebEntry
        return {
          id: row.module_id,
          name: manifest.name,
          version: row.version,
          description: manifest.description,
          visible,
          mcpEnabled,
          source: row.source,
          nav: visible ? [...manifest.nav] : [],
          webRoutes: visible ? [...manifest.webRoutes] : [],
          mcpTools: mcpToolInfos(manifest, row.module_id),
          webEntryUrl: visible && disk ? webEntryUrlFor(row.module_id, webEntry) : null,
        }
      }

      const loadBundledRuntime = (manifest: ModuleManifest) =>
        Effect.gen(function* () {
          const packageName = manifest.packageName
          if (!packageName) {
            return { ok: false as const, error: "Bundled module is missing packageName." }
          }
          const href = bundledPluginImportHref(packageName)
          if (!href) {
            return {
              ok: false as const,
              error: `Could not resolve ${packageName}/plugin-server.`,
            }
          }
          const rootDir = join(modulesDir, manifest.id)
          return yield* runtime.loadFromCreateModule(manifest.id, rootDir, manifest, href)
        })

      return {
        catalog: Effect.fn("Modules.catalog")(function* (_ownerId) {
          const installed = yield* listRows()
          const installedIds = new Set(installed.map((r) => r.module_id))
          const fromBundled = allCatalogManifests().map((m) =>
            catalogEntry(m, m.source, installedIds.has(m.id)),
          )
          const extras: CatalogModule[] = []
          for (const row of installed) {
            if (catalogManifest(row.module_id)) continue
            if (row.source !== "upload" && row.source !== "folder") continue
            const manifest = yield* resolveManifest(row)
            if (!manifest) continue
            extras.push({
              ...catalogEntry(manifest, row.source, true),
              version: row.version,
              packageName: row.package_name,
            })
          }
          return [...fromBundled, ...extras]
        }),

        installed: Effect.gen(function* () {
          const rows = yield* listRows()
          const out: InstalledModule[] = []
          for (const row of rows) {
            const meta = yield* metaFor(row.module_id, row)
            out.push(toInstalled(row, meta))
          }
          return out
        }),

        install: Effect.fn("Modules.install")(function* (actorRole, moduleId) {
          yield* requireAdmin(actorRole)
          const manifest = catalogManifest(moduleId)
          if (!manifest) {
            return yield* new ModuleNotFound({
              message: `Module "${moduleId}" is not in the catalog.`,
            })
          }
          const existing = yield* getRow(moduleId)
          if (existing) {
            return toInstalled(existing, mediaMeta(manifest, existing.source))
          }
          if (manifest.source !== "bundled") {
            return yield* new ModuleInstallFailed({
              message: "Use Upload plugin for non-bundled packages.",
            })
          }
          const load = yield* loadBundledRuntime(manifest)
          const loadError = load.ok ? null : load.error
          const rows = yield* upsertInstalled(manifest, "bundled", loadError)
          const row = rows[0]
          if (!row) {
            return yield* new ModuleInstallFailed({ message: "Could not record the install." })
          }
          return toInstalled(row, mediaMeta(manifest, "bundled"))
        }),

        upload: Effect.fn("Modules.upload")(function* (actorRole, upload) {
          yield* requireAdmin(actorRole)
          const lower = upload.filename.toLowerCase()
          if (!lower.endsWith(".zip") && !lower.endsWith(".placard-module")) {
            return yield* new ModuleInstallFailed({
              message: "Upload a .zip (or .placard-module) prebuilt plugin package.",
            })
          }
          const extracted = yield* extractModuleZip(upload.contentBase64, modulesDir)
          const load = yield* runtime.loadFromDisk(extracted.manifest.id, extracted.rootDir)
          const loadError = load.ok ? null : load.error
          const rows = yield* upsertInstalled(extracted.manifest, "upload", loadError)
          const row = rows[0]
          if (!row) {
            return yield* new ModuleInstallFailed({ message: "Could not record the upload." })
          }
          return toInstalled(row, mediaMeta(extracted.manifest, "upload"))
        }),

        uninstall: Effect.fn("Modules.uninstall")(function* (actorRole, moduleId) {
          yield* requireAdmin(actorRole)
          const row = yield* getRow(moduleId)
          if (!row) {
            return yield* new ModuleNotFound({ message: `Module "${moduleId}" is not installed.` })
          }
          runtime.unregister(moduleId)
          yield* sql`delete from user_module_prefs where module_id = ${moduleId}`.pipe(Effect.orDie)
          yield* sql`delete from instance_modules where module_id = ${moduleId}`.pipe(Effect.orDie)
          if (row.source === "upload" || row.source === "folder") {
            yield* removeModuleDir(modulesDir, moduleId)
          }
        }),

        setEnabled: Effect.fn("Modules.setEnabled")(function* (actorRole, moduleId, enabled) {
          if (actorRole !== "admin") {
            return yield* new ModuleNotFound({
              message: "Only an admin can enable or disable modules for the instance.",
            })
          }
          const rows = yield* sql<InstanceRow>`
            update instance_modules set enabled = ${enabled}
            where module_id = ${moduleId}
            returning module_id, version, source, package_name, enabled, load_error, installed_at`.pipe(
            Effect.orDie,
          )
          const row = rows[0]
          if (!row) {
            return yield* new ModuleNotFound({ message: `Module "${moduleId}" is not installed.` })
          }
          const meta = yield* metaFor(moduleId, row)
          return toInstalled(row, meta)
        }),

        me: Effect.fn("Modules.me")(function* (ownerId) {
          const rows = yield* sql<
            InstanceRow & { visible: boolean | null; mcp_enabled: boolean | null }
          >`
            select i.module_id, i.version, i.source, i.package_name, i.enabled, i.load_error,
                   i.installed_at, p.visible, p.mcp_enabled
            from instance_modules i
            left join user_module_prefs p
              on p.module_id = i.module_id and p.user_id = ${ownerId}
            where i.enabled = true
            order by i.installed_at, i.module_id`.pipe(Effect.orDie)

          const out: MyModule[] = []
          for (const row of rows) {
            const manifest = yield* resolveManifest(row)
            if (!manifest) continue
            const visible = row.visible ?? true
            const mcpEnabled = row.mcp_enabled ?? true
            out.push(toMyModule(row, manifest, visible, mcpEnabled))
          }
          return out
        }),

        setVisible: Effect.fn("Modules.setVisible")(function* (ownerId, moduleId, visible) {
          const row = yield* getRow(moduleId)
          if (!row?.enabled) {
            return yield* new ModuleNotFound({
              message: `Module "${moduleId}" is not available on this instance.`,
            })
          }
          const manifest = yield* resolveManifest(row)
          if (!manifest) {
            return yield* new ModuleNotFound({ message: `Module "${moduleId}" is unknown.` })
          }
          yield* sql`
            insert into user_module_prefs (user_id, module_id, visible)
            values (${ownerId}, ${moduleId}, ${visible})
            on conflict (user_id, module_id) do update set visible = ${visible}`.pipe(Effect.orDie)
          const prefs = yield* sql<{ mcp_enabled: boolean | null }>`
            select mcp_enabled from user_module_prefs
            where user_id = ${ownerId} and module_id = ${moduleId}`.pipe(Effect.orDie)
          return toMyModule(row, manifest, visible, prefs[0]?.mcp_enabled ?? true)
        }),

        setMcpEnabled: Effect.fn("Modules.setMcpEnabled")(function* (ownerId, moduleId, enabled) {
          const row = yield* getRow(moduleId)
          if (!row?.enabled) {
            return yield* new ModuleNotFound({
              message: `Module "${moduleId}" is not available on this instance.`,
            })
          }
          const manifest = yield* resolveManifest(row)
          if (!manifest) {
            return yield* new ModuleNotFound({ message: `Module "${moduleId}" is unknown.` })
          }
          yield* sql`
            insert into user_module_prefs (user_id, module_id, mcp_enabled)
            values (${ownerId}, ${moduleId}, ${enabled})
            on conflict (user_id, module_id) do update set mcp_enabled = ${enabled}`.pipe(
            Effect.orDie,
          )
          const prefs = yield* sql<{ visible: boolean | null }>`
            select visible from user_module_prefs
            where user_id = ${ownerId} and module_id = ${moduleId}`.pipe(Effect.orDie)
          return toMyModule(row, manifest, prefs[0]?.visible ?? true, enabled)
        }),

        isAvailableToUser: Effect.fn("Modules.isAvailableToUser")(function* (ownerId, moduleId) {
          const rows = yield* sql<{ enabled: boolean; visible: boolean | null }>`
            select i.enabled, p.visible
            from instance_modules i
            left join user_module_prefs p
              on p.module_id = i.module_id and p.user_id = ${ownerId}
            where i.module_id = ${moduleId}`.pipe(Effect.orDie)
          const row = rows[0]
          if (!row?.enabled) return false
          return row.visible ?? true
        }),

        isMcpEnabledForUser: Effect.fn("Modules.isMcpEnabledForUser")(
          function* (ownerId, moduleId) {
            const rows = yield* sql<{
              enabled: boolean
              visible: boolean | null
              mcp_enabled: boolean | null
            }>`
            select i.enabled, p.visible, p.mcp_enabled
            from instance_modules i
            left join user_module_prefs p
              on p.module_id = i.module_id and p.user_id = ${ownerId}
            where i.module_id = ${moduleId}`.pipe(Effect.orDie)
            const row = rows[0]
            if (!row?.enabled) return false
            if (!(row.visible ?? true)) return false
            return row.mcp_enabled ?? true
          },
        ),

        loadDiskModules: Effect.gen(function* () {
          const rows = yield* listRows()
          for (const row of rows) {
            if (!row.enabled) continue
            if (row.source === "upload" || row.source === "folder") {
              const rootDir = join(modulesDir, row.module_id)
              const load = yield* runtime.loadFromDisk(row.module_id, rootDir)
              yield* setLoadError(row.module_id, load.ok ? null : load.error)
              continue
            }
            if (row.source === "bundled") {
              const manifest = catalogManifest(row.module_id)
              if (!manifest) continue
              const load = yield* loadBundledRuntime(manifest)
              yield* setLoadError(row.module_id, load.ok ? null : load.error)
            }
          }
        }),

        resolveAsset: (moduleId, relativePath) =>
          Effect.sync(() => {
            const plugin = runtime.get(moduleId)
            const root = plugin?.rootDir ?? join(modulesDir, moduleId)
            const cleaned = relativePath.replace(/^\/+/, "").replace(/\\/g, "/")
            if (cleaned.includes("..") || cleaned.startsWith("/")) return null
            return { absolutePath: join(root, cleaned), rootDir: root }
          }),
      }
    }),
  )
}
