import type { ReactNode } from "react"
import { Link, useLocation } from "react-router"

const GITHUB = "https://github.com/JobiJoba/Placard"

export function SiteChrome({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const onDocs = pathname.startsWith("/docs") || pathname.startsWith("/install")

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link to="/" className="topbar-brand">
          Placard
        </Link>
        <nav className="topbar-nav" aria-label="Primary">
          <Link to="/docs/install" aria-current={onDocs ? "page" : undefined}>
            Docs
          </Link>
          <a href={GITHUB} rel="noreferrer" target="_blank">
            GitHub
          </a>
        </nav>
      </header>
      {children}
      <footer className="site-footer">
        <p>
          Placard is free software under{" "}
          <a href={`${GITHUB}/blob/main/LICENSE`} rel="noreferrer" target="_blank">
            AGPL-3.0
          </a>
          . Your places stay on your server.
        </p>
      </footer>
    </div>
  )
}
