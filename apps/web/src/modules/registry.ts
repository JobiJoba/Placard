import type { ComponentType } from "react"
import { DecidePage } from "@/pages/decide-page"

/**
 * First-party plugin web entries keyed by manifest `webRoutes.exportName`.
 * Uploaded plugins are not listed here — the shell uses PluginPageHost + webEntryUrl.
 */
export const bundledModulePages: Record<string, ComponentType> = {
  DecidePage,
}

export const pageForExport = (exportName: string): ComponentType | undefined =>
  bundledModulePages[exportName]
