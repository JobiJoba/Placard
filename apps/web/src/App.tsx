import type { MyModule } from "@placard/domain"
import { useCallback } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router"
import { AppShell } from "@/components/app-shell"
import { moduleRouteElements } from "@/components/module-routes"
import { api } from "@/lib/api"
import { useLoad } from "@/lib/use-load"
import { AddPlacePage } from "@/pages/add-place-page"
import { InvitePage, LoginPage, SetupPage } from "@/pages/auth-pages"
import { DeletedPage } from "@/pages/deleted-page"
import { ImportPage } from "@/pages/import-page"
import { LibraryPage } from "@/pages/library-page"
import { ListsPage } from "@/pages/lists-page"
import { PlacePage } from "@/pages/place-page"
import {
  RequireSettingsAdmin,
  SettingsGeneralPage,
  SettingsIntegrationsPage,
  SettingsLayout,
  SettingsMarketplacePage,
  SettingsModulePage,
  SettingsModulesIndexRedirect,
  SettingsPeoplePage,
} from "@/pages/settings"
import { RequireUser, SessionProvider } from "@/session"

function AuthenticatedRoutes() {
  const { data: modules } = useLoad(useCallback(() => api((c) => c.modules.me()), []))
  const list: ReadonlyArray<MyModule> = modules ?? []

  return (
    <Routes>
      <Route element={<AppShell modules={list} />}>
        <Route index element={<LibraryPage />} />
        <Route path="/add" element={<AddPlacePage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/import/:runId" element={<ImportPage />} />
        <Route path="/places/:id" element={<PlacePage />} />
        <Route path="/lists" element={<ListsPage />} />
        <Route path="/deleted" element={<DeletedPage />} />
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="general" replace />} />
          <Route path="general" element={<SettingsGeneralPage />} />
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
          <Route
            path="marketplace"
            element={
              <RequireSettingsAdmin>
                <SettingsMarketplacePage />
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
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route
            path="/*"
            element={
              <RequireUser>
                <AuthenticatedRoutes />
              </RequireUser>
            }
          />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}
