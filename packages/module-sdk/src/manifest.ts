import { Schema } from "effect"

/** Permissions a module may declare; host enforces at registration time. */
export const modulePermissions = ["places.read", "search.query", "media.read"] as const
export const ModulePermission = Schema.Literals(modulePermissions)
export type ModulePermission = typeof ModulePermission.Type

export const moduleSources = ["bundled", "npm", "folder", "upload"] as const
export const ModuleSource = Schema.Literals(moduleSources)
export type ModuleSource = typeof ModuleSource.Type

export const navSlots = ["primary", "more"] as const
export const NavSlot = Schema.Literals(navSlots)
export type NavSlot = typeof NavSlot.Type

export const ModuleNavItem = Schema.Struct({
  path: Schema.String,
  label: Schema.String,
  slot: NavSlot,
})
export type ModuleNavItem = typeof ModuleNavItem.Type

export const ModuleWebRoute = Schema.Struct({
  path: Schema.String,
  /** Export name from the module's web entry (bundled client registry or uploaded ESM). */
  exportName: Schema.String,
})
export type ModuleWebRoute = typeof ModuleWebRoute.Type

/**
 * Declared shape of a Placard plugin (`placard.module.json` / `defineModule`).
 * Prebuilt zip packages use `server.entry` / `web.entry` relative to the package root.
 */
export const ModuleManifest = Schema.Struct({
  id: Schema.String.pipe(Schema.check(Schema.isBetweenLength(3, 80))),
  name: Schema.String,
  version: Schema.String,
  description: Schema.String,
  permissions: Schema.Array(ModulePermission),
  nav: Schema.Array(ModuleNavItem),
  source: ModuleSource,
  /** npm package name when source is npm or bundled workspace package. */
  packageName: Schema.optional(Schema.String),
  webRoutes: Schema.Array(ModuleWebRoute),
  /** Semver of `@placard/module-sdk` the plugin was built against (major must match host). */
  sdkVersion: Schema.optional(Schema.String),
  /** Relative path to server ESM entry inside a prebuilt zip. */
  serverEntry: Schema.optional(Schema.String),
  /** Relative path to browser ESM entry inside a prebuilt zip. */
  webEntry: Schema.optional(Schema.String),
})
export type ModuleManifest = typeof ModuleManifest.Type

/** Host SDK version — bump major when ModuleHost* contracts break. */
export const HOST_SDK_VERSION = "0.1.0"

export const defineModule = <M extends ModuleManifest>(manifest: M): M => manifest

export const defaultServerEntry = "./server/index.js"
export const defaultWebEntry = "./web/index.js"

/** True when plugin sdkVersion major matches the host (missing sdkVersion allowed for bundled). */
export const sdkMajorCompatible = (pluginSdkVersion: string | undefined, host = HOST_SDK_VERSION) => {
  if (pluginSdkVersion == null || pluginSdkVersion === "") return true
  const pluginMajor = Number.parseInt(pluginSdkVersion.split(".")[0] ?? "", 10)
  const hostMajor = Number.parseInt(host.split(".")[0] ?? "", 10)
  if (!Number.isFinite(pluginMajor) || !Number.isFinite(hostMajor)) return false
  return pluginMajor === hostMajor
}
