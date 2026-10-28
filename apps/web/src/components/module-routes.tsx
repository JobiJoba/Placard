import type { MyModule } from "@placard/domain"
import { Navigate, Route } from "react-router"
import { PluginPageHost } from "@/components/plugin-page-host"
import { pageForExport } from "@/modules/registry"

/** Build React Router elements for modules the current user can see. */
export function moduleRouteElements(modules: ReadonlyArray<MyModule>) {
  const routes = []
  for (const mod of modules) {
    if (!mod.visible) continue
    for (const web of mod.webRoutes) {
      // Uploaded packs always win so a zip can replace a bundled page of the same exportName.
      if (mod.webEntryUrl) {
        routes.push(
          <Route
            key={web.path}
            path={web.path}
            element={
              <PluginPageHost
                moduleId={mod.id}
                exportName={web.exportName}
                webEntryUrl={mod.webEntryUrl}
              />
            }
          />,
        )
        continue
      }
      const Bundled = pageForExport(web.exportName)
      if (Bundled) {
        routes.push(<Route key={web.path} path={web.path} element={<Bundled />} />)
      }
    }
  }
  routes.push(
    <Route
      key="decide-redirect"
      path="/decide"
      element={<Navigate to="/m/restaurants.decide" replace />}
    />,
  )
  return routes
}
