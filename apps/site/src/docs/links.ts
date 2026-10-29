import { listPublishedSlugs } from "./catalog"

const GITHUB_BLOB = "https://github.com/JobiJoba/Placard/blob/main"
const GITHUB_RAW = "https://github.com/JobiJoba/Placard/raw/main"

const PUBLISHED = new Set(listPublishedSlugs())

/** Rewrite markdown hrefs for the docs site (sibling pages, repo files, anchors). */
export function rewriteDocHref(href: string | undefined): string | undefined {
  if (!href) return href
  if (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("#")
  ) {
    return href
  }

  const hashIndex = href.indexOf("#")
  const pathPart = hashIndex === -1 ? href : href.slice(0, hashIndex)
  const hash = hashIndex === -1 ? "" : href.slice(hashIndex + 1)
  const hashSuffix = hash ? `#${hash}` : ""
  const cleaned = pathPart.replace(/^\.\//, "")

  if (cleaned.endsWith(".md")) {
    const file = cleaned.split("/").pop()!.replace(/\.md$/, "")
    if (PUBLISHED.has(file)) {
      return `/docs/${file}${hashSuffix}`
    }
    return `${GITHUB_BLOB}/docs/${file}.md${hashSuffix}`
  }

  // Repo-relative paths from docs/ (../compose.ghcr.yaml, ../README.md, …)
  if (cleaned.startsWith("../")) {
    const repoPath = cleaned.replace(/^\.\.\//, "")
    if (/\.(ya?ml|json|env|ts|tsx|js|mjs|cjs)$/i.test(repoPath)) {
      return `${GITHUB_RAW}/${repoPath}`
    }
    return `${GITHUB_BLOB}/${repoPath}${hashSuffix}`
  }

  return href
}
