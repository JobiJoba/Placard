import { Link } from "react-router"
import { DocsChrome } from "../components/DocsChrome"
import { DOC_NAV } from "../docs/catalog"

export function DocsIndexPage() {
  return (
    <DocsChrome>
      <main id="main" className="docs-article">
        <h1>Documentation</h1>
        <p className="lede">
          Self-host Placard with Compose or a panel, wire Google Places when you want the full
          experience, then extend with MCP and modules.
        </p>
        {DOC_NAV.map((group) => (
          <section className="docs-index-group" key={group.label}>
            <h2>{group.label}</h2>
            <ul className="docs-index-list">
              {group.items.map((item) => (
                <li key={item.slug}>
                  <Link to={`/docs/${item.slug}`}>
                    <span className="docs-index-title">{item.title}</span>
                    <span className="docs-index-summary">{item.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </DocsChrome>
  )
}
