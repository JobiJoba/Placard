import { Schema } from "effect"

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
  exportName: Schema.String,
})
export type ModuleWebRoute = typeof ModuleWebRoute.Type

export const CatalogModule = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  version: Schema.String,
  description: Schema.String,
  source: ModuleSource,
  packageName: Schema.NullOr(Schema.String),
  installed: Schema.Boolean,
  permissions: Schema.Array(Schema.String),
})
export type CatalogModule = typeof CatalogModule.Type

export const InstalledModule = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  version: Schema.String,
  description: Schema.String,
  source: ModuleSource,
  packageName: Schema.NullOr(Schema.String),
  enabled: Schema.Boolean,
  installedAt: Schema.DateTimeUtcFromString,
  loadError: Schema.NullOr(Schema.String),
})
export type InstalledModule = typeof InstalledModule.Type

export const MyModule = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  version: Schema.String,
  description: Schema.String,
  visible: Schema.Boolean,
  source: ModuleSource,
  nav: Schema.Array(ModuleNavItem),
  webRoutes: Schema.Array(ModuleWebRoute),
  /** When set, the shell loads this ESM URL instead of a bundled registry page. */
  webEntryUrl: Schema.NullOr(Schema.String),
})
export type MyModule = typeof MyModule.Type

export const ModuleInstallInput = Schema.Struct({
  moduleId: Schema.String,
})
export type ModuleInstallInput = typeof ModuleInstallInput.Type

/** Prebuilt plugin zip as base64 (same pattern as Takeout upload). */
export const ModuleUpload = Schema.Struct({
  filename: Schema.Trim.pipe(Schema.check(Schema.isBetweenLength(1, 260))),
  contentBase64: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
})
export type ModuleUpload = typeof ModuleUpload.Type

export const ModuleEnabledUpdate = Schema.Struct({
  enabled: Schema.Boolean,
})
export type ModuleEnabledUpdate = typeof ModuleEnabledUpdate.Type

export const ModuleVisibleUpdate = Schema.Struct({
  visible: Schema.Boolean,
})
export type ModuleVisibleUpdate = typeof ModuleVisibleUpdate.Type

export class ModuleNotFound extends Schema.TaggedError<ModuleNotFound>()(
  "ModuleNotFound",
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}

export class ModuleDisabled extends Schema.TaggedError<ModuleDisabled>()(
  "ModuleDisabled",
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}

export class ModuleInstallFailed extends Schema.TaggedError<ModuleInstallFailed>()(
  "ModuleInstallFailed",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}
