import type { ReactNode } from "react"
import { Link, NavLink } from "react-router"
import { DOC_NAV } from "../docs/catalog"
import { SiteChrome } from "./SiteChrome"

export function DocsChrome({ children }: { children: ReactNode }) {
  return (
    <SiteChrome>
      <div className="docs-layout">
        <nav className="docs-nav" aria-label="Documentation">
          <p className="docs-nav-title">Docs</p>
          {DOC_NAV.map((group) => (
            <div className="docs-nav-group" key={group.label}>
              <p className="docs-nav-group-label">{group.label}</p>
              <ul className="docs-nav-list">
                {group.items.map((item) => (
                  <li key={item.slug}>
                    <NavLink
                      to={`/docs/${item.slug}`}
                      className={({ isActive }) =>
                        isActive ? "docs-nav-link is-active" : "docs-nav-link"
                      }
                    >
                      {item.title}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="docs-nav-foot">
            <Link to="/">← Home</Link>
          </p>
        </nav>
        <div className="docs-main">{children}</div>
      </div>
    </SiteChrome>
  )
}
