import { BrowserRouter, Navigate, Route, Routes } from "react-router"
import { AppShell } from "@/components/app-shell"
import { AddPlacePage } from "@/pages/add-place-page"
import { InvitePage, LoginPage, SetupPage } from "@/pages/auth-pages"
import { DeletedPage } from "@/pages/deleted-page"
import { ImportPage } from "@/pages/import-page"
import { LibraryPage } from "@/pages/library-page"
import { ListsPage } from "@/pages/lists-page"
import { PlacePage } from "@/pages/place-page"
import { SettingsPage } from "@/pages/settings-page"
import { RequireUser, SessionProvider } from "@/session"

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route
            element={
              <RequireUser>
                <AppShell />
              </RequireUser>
            }
          >
            <Route index element={<LibraryPage />} />
            <Route path="/add" element={<AddPlacePage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/import/:runId" element={<ImportPage />} />
            <Route path="/places/:id" element={<PlacePage />} />
            <Route path="/lists" element={<ListsPage />} />
            <Route path="/deleted" element={<DeletedPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}
