import { restaurantsDecideManifest } from "@placard/module-restaurants-decide/manifest"
import type { ModuleManifest } from "@placard/module-sdk"

/** First-party + curated marketplace entries available to install. */
export const bundledCatalog: ReadonlyArray<ModuleManifest> = [restaurantsDecideManifest]

const byId = new Map(bundledCatalog.map((m) => [m.id, m]))

export const catalogManifest = (moduleId: string): ModuleManifest | undefined => byId.get(moduleId)

export const allCatalogManifests = (): ReadonlyArray<ModuleManifest> => bundledCatalog
