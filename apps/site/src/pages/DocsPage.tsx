import { useEffect } from "react"
import { Link, Navigate, useParams } from "react-router"
import { DocsChrome } from "../components/DocsChrome"
import { MarkdownDoc } from "../components/MarkdownDoc"
import { getDocMarkdown, getDocMeta } from "../docs/catalog"

export function DocsPage() {
  const { slug = "" } = useParams()
  const meta = getDocMeta(slug)
  const source = getDocMarkdown(slug)

  useEffect(() => {
    void slug
    window.scrollTo(0, 0)
  }, [slug])

  if (!meta || !source) {
    return <Navigate to="/docs" replace />
  }

  return (
    <DocsChrome>
      <article id="main" className="docs-article" key={slug}>
        <MarkdownDoc source={source} />
        <p className="docs-article-foot">
          <Link to="/docs">All docs</Link>
          {" · "}
          <a
            href={`https://github.com/JobiJoba/Placard/blob/main/docs/${slug}.md`}
            rel="noreferrer"
            target="_blank"
          >
            Edit on GitHub
          </a>
        </p>
      </article>
    </DocsChrome>
  )
}
