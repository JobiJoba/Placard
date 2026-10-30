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

  // Repo-relative from docs/ first (../README.md#develop, ../compose.ghcr.yaml, …)
  // Must run before the sibling `.md` branch — otherwise `../README.md` becomes docs/README.md.
  if (cleaned.startsWith("../")) {
    const repoPath = cleaned.replace(/^\.\.\//, "")
    // Config / source downloads (include `.env.example`, not only `*.env`)
    if (/(?:^|\/)(?:\.env(?:\..+)?|.+\.(?:ya?ml|json|ts|tsx|js|mjs|cjs))$/i.test(repoPath)) {
      return `${GITHUB_RAW}/${repoPath}`
    }
    return `${GITHUB_BLOB}/${repoPath}${hashSuffix}`
  }

  if (cleaned.endsWith(".md")) {
    const file = cleaned.split("/").pop()?.replace(/\.md$/, "")
    if (!file) return href
    if (PUBLISHED.has(file)) {
      return `/docs/${file}${hashSuffix}`
    }
    return `${GITHUB_BLOB}/docs/${file}.md${hashSuffix}`
  }

  return href
}
