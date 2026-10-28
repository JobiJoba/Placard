import {
  type CatalogModule,
  type InstalledModule,
  ModuleInstallFailed,
  ModuleNotFound,
  type ModuleSource,
  type ModuleUpload,
  type MyModule,
} from "@placard/domain"
import {
  defaultWebEntry,
  type ModuleManifest,
} from "@placard/module-sdk"
import { join } from "node:path"
import { Context, DateTime, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { AppConfig } from "../config.ts"
import { allCatalogManifests, catalogManifest } from "./catalog.ts"
import { ModuleRuntime, webEntryUrlFor } from "./loader.ts"
import { extractModuleZip, removeModuleDir } from "./package-zip.ts"

interface InstanceRow {
  readonly module_id: string
  readonly version: string
  readonly source: ModuleSource
  readonly package_name: string | null
  readonly enabled: boolean
  readonly load_error: string | null
  readonly installed_at: Date
}

const toInstalled = (
  row: InstanceRow,
  meta: { name: string; description: string },
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
    readonly isAvailableToUser: (ownerId: string, moduleId: string) => Effect.Effect<boolean>
    /** Load all enabled disk modules after migrate (folder/upload). */
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
          const m = yield* resolveManifest(
            row ?? {
              module_id: moduleId,
              version: "0.0.0",
              source: "bundled",
              package_name: null,
              enabled: true,
              load_error: null,
              installed_at: new Date(),
            },
          )
          return m
            ? { name: m.name, description: m.description, version: m.version }
            : { name: moduleId, description: "", version: row?.version ?? "0.0.0" }
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

      const toMyModule = (
        row: InstanceRow,
        manifest: ModuleManifest,
        visible: boolean,
      ): MyModule => {
        const disk = row.source === "upload" || row.source === "folder"
        const webEntry = manifest.webEntry ?? defaultWebEntry
        return {
          id: row.module_id,
          name: manifest.name,
          version: row.version,
          description: manifest.description,
          visible,
          source: row.source,
          nav: visible ? [...manifest.nav] : [],
          webRoutes: visible ? [...manifest.webRoutes] : [],
          webEntryUrl: visible && disk ? webEntryUrlFor(row.module_id, webEntry) : null,
        }
      }

      return {
        catalog: Effect.fn("Modules.catalog")(function* (_ownerId) {
          const installed = yield* listRows()
          const installedIds = new Set(installed.map((r) => r.module_id))
          const fromBundled = allCatalogManifests().map(
            (m): CatalogModule => ({
              id: m.id,
              name: m.name,
              version: m.version,
              description: m.description,
              source: m.source,
              packageName: m.packageName ?? null,
              installed: installedIds.has(m.id),
              permissions: [...m.permissions],
            }),
          )
          const extras: CatalogModule[] = []
          for (const row of installed) {
            if (catalogManifest(row.module_id)) continue
            if (row.source !== "upload" && row.source !== "folder") continue
            const manifest = yield* resolveManifest(row)
            if (!manifest) continue
            extras.push({
              id: row.module_id,
              name: manifest.name,
              version: row.version,
              description: manifest.description,
              source: row.source,
              packageName: row.package_name,
              installed: true,
              permissions: [...manifest.permissions],
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
            return toInstalled(existing, {
              name: manifest.name,
              description: manifest.description,
            })
          }
          if (manifest.source !== "bundled") {
            return yield* new ModuleInstallFailed({
              message: "Use Upload plugin for non-bundled packages.",
            })
          }
          const rows = yield* upsertInstalled(manifest, "bundled", null)
          const row = rows[0]
          if (!row) {
            return yield* new ModuleInstallFailed({ message: "Could not record the install." })
          }
          return toInstalled(row, {
            name: manifest.name,
            description: manifest.description,
          })
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
          return toInstalled(row, {
            name: extracted.manifest.name,
            description: extracted.manifest.description,
          })
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
          const rows = yield* sql<InstanceRow & { visible: boolean | null }>`
            select i.module_id, i.version, i.source, i.package_name, i.enabled, i.load_error,
                   i.installed_at, p.visible
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
            out.push(toMyModule(row, manifest, visible))
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
          return toMyModule(row, manifest, visible)
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

        loadDiskModules: Effect.gen(function* () {
          const rows = yield* listRows()
          for (const row of rows) {
            if (!row.enabled) continue
            if (row.source !== "upload" && row.source !== "folder") continue
            const rootDir = join(modulesDir, row.module_id)
            const load = yield* runtime.loadFromDisk(row.module_id, rootDir)
            yield* setLoadError(row.module_id, load.ok ? null : load.error)
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
