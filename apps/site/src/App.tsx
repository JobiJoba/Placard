import { useEffect } from "react"
import { Link, Navigate, Route, Routes, useLocation } from "react-router"
import { SiteChrome } from "./components/SiteChrome"
import { pageMetadata, SITE_ORIGIN } from "./metadata"
import { DocsIndexPage } from "./pages/DocsIndexPage"
import { DocsPage } from "./pages/DocsPage"
import { HomePage } from "./pages/HomePage"
import { PluginsPage } from "./pages/PluginsPage"

export function App() {
  const { pathname } = useLocation()
  useEffect(() => {
    const meta = pageMetadata(pathname)
    document.title = meta.title
    document.querySelector('meta[name="description"]')?.setAttribute("content", meta.description)
    const canonical =
      document.querySelector('link[rel="canonical"]') ??
      document.head.appendChild(document.createElement("link"))
    canonical.setAttribute("rel", "canonical")
    canonical.setAttribute("href", `${SITE_ORIGIN}${meta.path}`)
  }, [pathname])
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/plugins" element={<PluginsPage />} />
      <Route path="/docs" element={<DocsIndexPage />} />
      <Route path="/docs/:slug" element={<DocsPage />} />
      <Route path="/install" element={<Navigate to="/docs/install" replace />} />
      <Route
        path="*"
        element={
          <SiteChrome>
            <main id="main">
              <h1>Page not found</h1>
              <Link to="/">Back to Placard</Link>
            </main>
          </SiteChrome>
        }
      />
    </Routes>
  )
}
