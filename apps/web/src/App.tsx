import type { MyModule } from "@placard/domain"
import { BrowserRouter, Navigate, Route, Routes } from "react-router"
import { AppShell } from "@/components/app-shell"
import { moduleRouteElements } from "@/components/module-routes"
import { ModulesProvider, useModules } from "@/modules"
import { AddPlacePage } from "@/pages/add-place-page"
import { GoogleSetupPage, InvitePage, LoginPage, SetupPage } from "@/pages/auth-pages"
import { DeletedPage } from "@/pages/deleted-page"
import { ImportPage } from "@/pages/import-page"
import { LibraryPage } from "@/pages/library-page"
import { ListsPage } from "@/pages/lists-page"
import { MarketplacePage } from "@/pages/marketplace-page"
import { PlacePage } from "@/pages/place-page"
import {
  RequireSettingsAdmin,
  SettingsBudgetPage,
  SettingsDebugPage,
  SettingsGeneralPage,
  SettingsIntegrationsPage,
  SettingsLayout,
  SettingsMarketplacePage,
  SettingsMcpPage,
  SettingsModulePage,
  SettingsModulesIndexRedirect,
  SettingsPeoplePage,
} from "@/pages/settings"
import { SettingsPlaceTypesPage } from "@/pages/settings/place-types-page"
import { FullPageMessage, RequireUser, SessionProvider } from "@/session"

function AuthenticatedRoutes() {
  const { data: modules, error, reload } = useModules()
  // Keep the deep link until the asynchronously loaded module routes are known.
  if (modules === null) {
    return (
      <FullPageMessage>
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <button type="button" onClick={reload} className="underline">
              Retry
            </button>
          </div>
        ) : (
          "Loading…"
        )}
      </FullPageMessage>
    )
  }
  const list: ReadonlyArray<MyModule> = modules ?? []

  return (
    <Routes>
      <Route element={<AppShell modules={list} />}>
        <Route index element={<LibraryPage />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/add" element={<AddPlacePage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/import/:runId" element={<ImportPage />} />
        <Route path="/places/:id" element={<PlacePage />} />
        <Route path="/lists" element={<ListsPage />} />
        <Route path="/deleted" element={<DeletedPage />} />
        <Route path="/settings" element={<SettingsLayout />}>
          <Route
            path="manage-plugins"
            element={
              <RequireSettingsAdmin>
                <SettingsMarketplacePage />
              </RequireSettingsAdmin>
            }
          />
          <Route index element={<Navigate to="general" replace />} />
          <Route path="general" element={<SettingsGeneralPage />} />
          <Route path="place-types" element={<SettingsPlaceTypesPage />} />
          <Route path="mcp" element={<SettingsMcpPage />} />
          <Route
            path="modules"
            element={
              <RequireSettingsAdmin>
                <SettingsModulesIndexRedirect />
              </RequireSettingsAdmin>
            }
          />
          <Route
            path="modules/:moduleId"
            element={
              <RequireSettingsAdmin>
                <SettingsModulePage />
              </RequireSettingsAdmin>
            }
          />
          <Route path="marketplace" element={<Navigate to="/marketplace" replace />} />
          <Route
            path="budget"
            element={
              <RequireSettingsAdmin>
                <SettingsBudgetPage />
              </RequireSettingsAdmin>
            }
          />
          <Route
            path="integrations"
            element={
              <RequireSettingsAdmin>
                <SettingsIntegrationsPage />
              </RequireSettingsAdmin>
            }
          />
          <Route
            path="debug"
            element={
              <RequireSettingsAdmin>
                <SettingsDebugPage />
              </RequireSettingsAdmin>
            }
          />
          <Route
            path="people"
            element={
              <RequireSettingsAdmin>
                <SettingsPeoplePage />
              </RequireSettingsAdmin>
            }
          />
        </Route>
        {moduleRouteElements(list)}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/setup/google" element={<GoogleSetupPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route
            path="/*"
            element={
              <RequireUser>
                <ModulesProvider>
                  <AuthenticatedRoutes />
                </ModulesProvider>
              </RequireUser>
            }
          />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}
