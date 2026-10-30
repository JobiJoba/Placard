import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import { Link } from "react-router"
import remarkGfm from "remark-gfm"
import { rewriteDocHref } from "../docs/links"
import { CopySnippet } from "./CopySnippet"

function headingId(children: unknown): string | undefined {
  const text = flattenText(children)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
  return text || undefined
}

function flattenText(node: unknown): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join("")
  if (typeof node === "object" && node !== null && "props" in node) {
    const props = (node as { props?: { children?: unknown } }).props
    return flattenText(props?.children)
  }
  return ""
}

const components: Components = {
  a({ href, children }) {
    const next = rewriteDocHref(href)
    if (next?.startsWith("/") && !next.startsWith("//")) {
      return <Link to={next}>{children}</Link>
    }
    return (
      <a href={next} rel="noreferrer" target={next?.startsWith("http") ? "_blank" : undefined}>
        {children}
      </a>
    )
  },
  h1({ children }) {
    return <h1 id={headingId(children)}>{children}</h1>
  },
  h2({ children }) {
    return <h2 id={headingId(children)}>{children}</h2>
  },
  h3({ children }) {
    return <h3 id={headingId(children)}>{children}</h3>
  },
  h4({ children }) {
    return <h4 id={headingId(children)}>{children}</h4>
  },
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children
    if (
      child &&
      typeof child === "object" &&
      "props" in child &&
      (child as { props?: { className?: string; children?: unknown } }).props
    ) {
      const props = (child as { props: { className?: string; children?: unknown } }).props
      const code = flattenText(props.children).replace(/\n$/, "")
      const rawLang = props.className?.replace(/^language-/, "") || ""
      const lang = rawLang === "text" || rawLang === "prompt" ? "Copy brief" : rawLang || "Commands"
      return <CopySnippet code={code} label={lang} />
    }
    return <pre>{children}</pre>
  },
  code({ className, children }) {
    if (className) {
      return <code className={className}>{children}</code>
    }
    return <code>{children}</code>
  },
  table({ children }) {
    return (
      <div className="md-table-wrap">
        <table>{children}</table>
      </div>
    )
  },
}

export function MarkdownDoc({ source }: { source: string }) {
  return (
    <div className="md-doc">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  )
}
