import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import type { ModuleManifest } from "@placard/module-sdk"

export const bundledPluginsDir = fileURLToPath(new URL("../../bundled-plugins/", import.meta.url))
export const bundledCatalog: ReadonlyArray<ModuleManifest> = readdirSync(bundledPluginsDir, {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map(
    (entry) =>
      JSON.parse(
        readFileSync(join(bundledPluginsDir, entry.name, "placard.module.json"), "utf8"),
      ) as ModuleManifest,
  )
const byId = new Map(bundledCatalog.map((m) => [m.id, m]))
export const catalogManifest = (id: string) => byId.get(id)
export const allCatalogManifests = () => bundledCatalog
