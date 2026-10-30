import { join } from "node:path"
import {
  type CatalogModule,
  type InstalledModule,
  ModuleInstallFailed,
  ModuleNotFound,
  type ModuleSource,
  type ModuleUpdateCheckResult,
  type ModuleUpload,
  type MyModule,
} from "@placard/domain"
import { defaultWebEntry, type ModuleManifest, moduleMcpToolName } from "@placard/module-sdk"
import { Context, DateTime, Effect, Layer } from "effect"
import { HttpClient } from "effect/http"
import { SqlClient } from "effect/sql"
import { AppConfig } from "../config.ts"
import { allCatalogManifests, catalogManifest } from "./catalog.ts"
import {
  downloadReleaseAsset,
  fetchLatestPluginZip,
  fetchLatestRelease,
  isNewerSemver,
  parseGithubRepoUrl,
  pickReleaseAsset,
} from "./github-install.ts"
import { ModuleRuntime, webEntryUrlFor } from "./loader.ts"
import {
  extractModuleZip,
  extractModuleZipBytes,
  peekModuleManifestFromZip,
  removeModuleDir,
} from "./package-zip.ts"

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
  readonly github_owner: string | null
  readonly github_repo: string | null
  readonly github_repo_url: string | null
  readonly github_release_tag: string | null
  readonly github_asset_name: string | null
  readonly latest_available_version: string | null
  readonly update_available: boolean
  readonly update_checked_at: Date | null
}

interface GithubInstallMeta {
  readonly owner: string
  readonly repo: string
  readonly repoUrl: string
  readonly releaseTag: string
  readonly assetName: string
}

const isDiskSource = (source: ModuleSource) =>
  source === "upload" || source === "folder" || source === "github"

/** Resolve manifest icon/cover to a browser URL (or null). */
export const resolveModuleMediaUrl = (
  moduleId: string,
  source: ModuleSource,
  media: string | undefined,
): string | null => {
  if (media == null || media.trim() === "") return null
  const value = media.trim()
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) return value
  if (isDiskSource(source)) {
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
  githubRepoUrl: row.github_repo_url,
  updateAvailable: row.update_available,
  latestAvailableVersion: row.latest_available_version,
  updateCheckedAt:
    row.update_checked_at != null ? DateTime.fromDateUnsafe(row.update_checked_at) : null,
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
    readonly installFromGithub: (
      actorRole: "admin" | "member",
      url: string,
    ) => Effect.Effect<InstalledModule, ModuleInstallFailed>
    readonly updateFromGithub: (
      actorRole: "admin" | "member",
      moduleId: string,
    ) => Effect.Effect<InstalledModule, ModuleNotFound | ModuleInstallFailed>
    /** Check GitHub-sourced modules for newer releases. Pass force to ignore interval. */
    readonly checkUpdates: (options?: {
      readonly force?: boolean
    }) => Effect.Effect<ModuleUpdateCheckResult>
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
      const httpClient = yield* HttpClient.HttpClient
      const modulesDir = config.modulesDir

      const withHttp = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
        effect.pipe(Effect.provideService(HttpClient.HttpClient, httpClient))

      const requireAdmin = (role: "admin" | "member") =>
        role === "admin"
          ? Effect.void
          : Effect.fail(
              new ModuleInstallFailed({ message: "Only an admin can install or remove modules." }),
            )

      const getRow = (moduleId: string) =>
        sql<InstanceRow>`
          select module_id, version, source, package_name, enabled, load_error, installed_at,
            github_owner, github_repo, github_repo_url, github_release_tag, github_asset_name,
            latest_available_version, update_available, update_checked_at
          from instance_modules where module_id = ${moduleId}`.pipe(
          Effect.map((rows) => rows[0]),
          Effect.orDie,
        )

      const listRows = () =>
        sql<InstanceRow>`
          select module_id, version, source, package_name, enabled, load_error, installed_at,
            github_owner, github_repo, github_repo_url, github_release_tag, github_asset_name,
            latest_available_version, update_available, update_checked_at
          from instance_modules
          order by installed_at, module_id`.pipe(Effect.orDie)

      const emptyGithubFields = {
        github_owner: null as string | null,
        github_repo: null as string | null,
        github_repo_url: null as string | null,
        github_release_tag: null as string | null,
        github_asset_name: null as string | null,
        latest_available_version: null as string | null,
        update_available: false,
        update_checked_at: null as Date | null,
      }

      const resolveManifest = (row: InstanceRow): Effect.Effect<ModuleManifest | null> =>
        Effect.gen(function* () {
          const bundled = catalogManifest(row.module_id)
          if (bundled) return bundled
          if (isDiskSource(row.source)) {
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
            ...emptyGithubFields,
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
        github?: GithubInstallMeta | null,
      ) =>
        sql<InstanceRow>`
          insert into instance_modules (
            module_id, version, source, package_name, enabled, load_error,
            github_owner, github_repo, github_repo_url, github_release_tag, github_asset_name,
            latest_available_version, update_available, update_checked_at
          ) values (
            ${manifest.id}, ${manifest.version}, ${source},
            ${manifest.packageName ?? null}, true, ${loadError},
            ${github?.owner ?? null}, ${github?.repo ?? null}, ${github?.repoUrl ?? null},
            ${github?.releaseTag ?? null}, ${github?.assetName ?? null},
            ${manifest.version}, false, now()
          )
          on conflict (module_id) do update set
            version = excluded.version,
            source = excluded.source,
            package_name = excluded.package_name,
            enabled = true,
            load_error = excluded.load_error,
            installed_at = now(),
            github_owner = excluded.github_owner,
            github_repo = excluded.github_repo,
            github_repo_url = excluded.github_repo_url,
            github_release_tag = excluded.github_release_tag,
            github_asset_name = excluded.github_asset_name,
            latest_available_version = excluded.latest_available_version,
            update_available = false,
            update_checked_at = now()
          returning module_id, version, source, package_name, enabled, load_error, installed_at,
            github_owner, github_repo, github_repo_url, github_release_tag, github_asset_name,
            latest_available_version, update_available, update_checked_at`.pipe(Effect.orDie)

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
        const disk = isDiskSource(row.source)
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
          actions: visible ? [...(manifest.actions ?? [])] : [],
          mcpTools: mcpToolInfos(manifest, row.module_id),
          webEntryUrl: visible && disk ? webEntryUrlFor(row.module_id, webEntry) : null,
        }
      }

      const installGithubPackage = (ref: {
        readonly owner: string
        readonly repo: string
        readonly repoUrl: string
      }): Effect.Effect<InstalledModule, ModuleInstallFailed> =>
        withHttp(
          Effect.gen(function* () {
            const { release, asset, bytes } = yield* fetchLatestPluginZip(ref)
            const extracted = yield* extractModuleZipBytes(bytes, modulesDir)
            const load = yield* runtime.loadFromDisk(extracted.manifest.id, extracted.rootDir)
            const loadError = load.ok ? null : load.error
            const rows = yield* upsertInstalled(extracted.manifest, "github", loadError, {
              owner: ref.owner,
              repo: ref.repo,
              repoUrl: ref.repoUrl,
              releaseTag: release.tagName,
              assetName: asset.name,
            })
            const row = rows[0]
            if (!row) {
              return yield* new ModuleInstallFailed({
                message: "Could not record the GitHub install.",
              })
            }
            return toInstalled(row, mediaMeta(extracted.manifest, "github"))
          }),
        )

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
            if (!isDiskSource(row.source)) continue
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
          const rows = yield* upsertInstalled(manifest, "bundled", loadError, null)
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
          const rows = yield* upsertInstalled(extracted.manifest, "upload", loadError, null)
          const row = rows[0]
          if (!row) {
            return yield* new ModuleInstallFailed({ message: "Could not record the upload." })
          }
          return toInstalled(row, mediaMeta(extracted.manifest, "upload"))
        }),

        installFromGithub: Effect.fn("Modules.installFromGithub")(function* (actorRole, url) {
          yield* requireAdmin(actorRole)
          const ref = parseGithubRepoUrl(url)
          if (!ref) {
            return yield* new ModuleInstallFailed({
              message: "Enter a public GitHub repo URL or owner/repo.",
            })
          }
          return yield* installGithubPackage(ref)
        }),

        updateFromGithub: Effect.fn("Modules.updateFromGithub")(function* (actorRole, moduleId) {
          yield* requireAdmin(actorRole)
          const row = yield* getRow(moduleId)
          if (!row) {
            return yield* new ModuleNotFound({ message: `Module "${moduleId}" is not installed.` })
          }
          if (row.source !== "github" || !row.github_owner || !row.github_repo) {
            return yield* new ModuleInstallFailed({
              message: `Module "${moduleId}" was not installed from GitHub.`,
            })
          }
          return yield* installGithubPackage({
            owner: row.github_owner,
            repo: row.github_repo,
            repoUrl:
              row.github_repo_url ?? `https://github.com/${row.github_owner}/${row.github_repo}`,
          })
        }),

        checkUpdates: Effect.fn("Modules.checkUpdates")(function* (options) {
          const force = options?.force ?? false
          const settings = yield* sql<{ module_update_check_hours: number }>`
            select module_update_check_hours from instance_settings where id = 1`.pipe(Effect.orDie)
          const hours = settings[0]?.module_update_check_hours ?? 24
          if (!force && hours === 0) {
            return { checked: 0, updatesAvailable: 0 }
          }

          const rows = yield* listRows()
          const githubRows = rows.filter(
            (r) => r.source === "github" && r.github_owner && r.github_repo,
          )
          const now = Date.now()
          const intervalMs = hours * 60 * 60 * 1000
          let checked = 0
          let updatesAvailable = 0

          for (const row of githubRows) {
            if (
              !force &&
              row.update_checked_at != null &&
              now - row.update_checked_at.getTime() < intervalMs
            ) {
              if (row.update_available) updatesAvailable += 1
              continue
            }

            checked += 1
            const owner = row.github_owner!
            const repo = row.github_repo!
            const result = yield* withHttp(
              fetchLatestRelease(owner, repo).pipe(
                Effect.map((release) => ({ ok: true as const, release })),
                Effect.catchTag("ModuleInstallFailed", (error) =>
                  Effect.succeed({
                    ok: false as const,
                    message: error.message,
                  }),
                ),
              ),
            )

            if (!result.ok) {
              yield* Effect.logWarning("GitHub module update check failed", {
                moduleId: row.module_id,
                message: result.message,
              })
              yield* sql`
                update instance_modules set update_checked_at = now()
                where module_id = ${row.module_id}`.pipe(Effect.orDie)
              if (row.update_available) updatesAvailable += 1
              continue
            }

            const { release } = result
            if (release.tagName === row.github_release_tag) {
              yield* sql`
                update instance_modules
                set update_checked_at = now(), update_available = false,
                    latest_available_version = ${row.version}
                where module_id = ${row.module_id}`.pipe(Effect.orDie)
              continue
            }

            const asset = pickReleaseAsset(release.assets)
            if (!asset) {
              yield* sql`
                update instance_modules set update_checked_at = now()
                where module_id = ${row.module_id}`.pipe(Effect.orDie)
              if (row.update_available) updatesAvailable += 1
              continue
            }

            const remoteVersion = yield* withHttp(
              downloadReleaseAsset(asset).pipe(
                Effect.flatMap(peekModuleManifestFromZip),
                Effect.map((m) => m.version),
                Effect.catchTag("ModuleInstallFailed", () => Effect.succeed(null as string | null)),
              ),
            )

            if (remoteVersion == null) {
              yield* sql`
                update instance_modules set update_checked_at = now()
                where module_id = ${row.module_id}`.pipe(Effect.orDie)
              if (row.update_available) updatesAvailable += 1
              continue
            }

            const newer = isNewerSemver(remoteVersion, row.version)
            yield* sql`
              update instance_modules
              set update_checked_at = now(),
                  update_available = ${newer},
                  latest_available_version = ${remoteVersion}
              where module_id = ${row.module_id}`.pipe(Effect.orDie)
            if (newer) updatesAvailable += 1
          }

          return { checked, updatesAvailable }
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
          if (isDiskSource(row.source)) {
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
            returning module_id, version, source, package_name, enabled, load_error, installed_at,
              github_owner, github_repo, github_repo_url, github_release_tag, github_asset_name,
              latest_available_version, update_available, update_checked_at`.pipe(Effect.orDie)
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
                   i.installed_at, i.github_owner, i.github_repo, i.github_repo_url,
                   i.github_release_tag, i.github_asset_name, i.latest_available_version,
                   i.update_available, i.update_checked_at, p.visible, p.mcp_enabled
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
            if (isDiskSource(row.source)) {
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
