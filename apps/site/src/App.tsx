import { Navigate, Route, Routes } from "react-router"
import { HomePage } from "./pages/HomePage"
import { InstallPage } from "./pages/InstallPage"

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/install" element={<InstallPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
