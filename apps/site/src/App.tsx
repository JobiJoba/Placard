import { Navigate, Route, Routes } from "react-router"
import { DocsIndexPage } from "./pages/DocsIndexPage"
import { DocsPage } from "./pages/DocsPage"
import { HomePage } from "./pages/HomePage"

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/docs" element={<DocsIndexPage />} />
      <Route path="/docs/:slug" element={<DocsPage />} />
      <Route path="/install" element={<Navigate to="/docs/install" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
