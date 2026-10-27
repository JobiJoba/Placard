import { BrowserRouter, Navigate, Route, Routes } from "react-router"
import { AppShell } from "@/components/app-shell"
import { InvitePage, LoginPage, SetupPage } from "@/pages/auth-pages"
import { LibraryPage } from "@/pages/library-page"
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
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}
