import { defineModule } from "@placard/module-sdk"
import raw from "../placard.module.json" with { type: "json" }

export const restaurantsDecideManifest = defineModule({
  id: raw.id,
  name: raw.name,
  version: raw.version,
  description: raw.description,
  permissions: raw.permissions as ["places.read", "search.query"],
  nav: raw.nav as [{ path: string; label: string; slot: "primary" }],
  source: "bundled" as const,
  packageName: raw.packageName,
  sdkVersion: raw.sdkVersion,
  serverEntry: raw.serverEntry,
  webEntry: raw.webEntry,
  icon: raw.icon,
  cover: raw.cover,
  webRoutes: raw.webRoutes as [{ path: string; exportName: string }],
  mcpTools: raw.mcpTools as [{ name: string; title?: string; description: string }] | undefined,
})

export const RESTAURANTS_DECIDE_ID = restaurantsDecideManifest.id
