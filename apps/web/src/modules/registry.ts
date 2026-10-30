import type { ComponentType } from "react"

/**
 * First-party plugin web entries keyed by manifest `webRoutes.exportName`.
 * Uploaded / GitHub plugins are not listed here — the shell uses PluginPageHost + webEntryUrl.
 */
export const bundledModulePages: Record<string, ComponentType> = {}

export const pageForExport = (exportName: string): ComponentType | undefined =>
  bundledModulePages[exportName]
