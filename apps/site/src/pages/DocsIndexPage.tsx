import { Link } from "react-router"
import { DocsChrome } from "../components/DocsChrome"
import { DOC_NAV } from "../docs/catalog"

export function DocsIndexPage() {
  return (
    <DocsChrome>
      <main id="main" className="docs-article">
        <h1>Make yourself at home.</h1>
        <p className="lede">
          Everything you need to start a library, run your instance, and make Placard your own. New
          here? Begin with Meet Placard, then follow the installation guide.
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
