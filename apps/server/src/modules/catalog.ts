import type { ModuleManifest } from "@placard/module-sdk"

/** First-party + curated marketplace entries available to install. Empty: wheels come from zip / GitHub. */
export const bundledCatalog: ReadonlyArray<ModuleManifest> = []

const byId = new Map(bundledCatalog.map((m) => [m.id, m]))

export const catalogManifest = (moduleId: string): ModuleManifest | undefined => byId.get(moduleId)

export const allCatalogManifests = (): ReadonlyArray<ModuleManifest> => bundledCatalog
