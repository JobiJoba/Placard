#!/usr/bin/env node
/**
 * Fail if published docs contain dead relative links or unknown in-page anchors.
 * Run from repo root or apps/site: node apps/site/scripts/check-doc-links.mjs
 */
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const siteRoot = resolve(here, "..")
const repoRoot = resolve(siteRoot, "../..")
const docsDir = join(repoRoot, "docs")

/** Keep in sync with apps/site/src/docs/catalog.ts DOC_NAV slugs. */
const PUBLISHED = [
  "install",
  "google-apis",
  "deployment",
  "mcp",
  "creating-modules",
  "module-brief-for-ai",
  "architecture-modules",
  "takeout-format",
]

const GITHUB_BLOB = "https://github.com/JobiJoba/Placard/blob/main"
const GITHUB_RAW = "https://github.com/JobiJoba/Placard/raw/main"
const publishedSet = new Set(PUBLISHED)

function githubHeadingId(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/ /g, "-")
}

function headingIdsFromMarkdown(source) {
  const ids = new Set()
  for (const line of source.split("\n")) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (!m) continue
    ids.add(githubHeadingId(m[2].replace(/#+$/, "").trim()))
  }
  return ids
}

function rewriteDocHref(href) {
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

  if (cleaned.startsWith("../")) {
    const repoPath = cleaned.replace(/^\.\.\//, "")
    if (/(?:^|\/)(?:\.env(?:\..+)?|.+\.(?:ya?ml|json|ts|tsx|js|mjs|cjs))$/i.test(repoPath)) {
      return `${GITHUB_RAW}/${repoPath}`
    }
    return `${GITHUB_BLOB}/${repoPath}${hashSuffix}`
  }

  if (cleaned.endsWith(".md")) {
    const file = cleaned.split("/").pop()?.replace(/\.md$/, "")
    if (!file) return href
    if (publishedSet.has(file)) return `/docs/${file}${hashSuffix}`
    return `${GITHUB_BLOB}/docs/${file}.md${hashSuffix}`
  }

  return href
}

function extractHrefs(source) {
  const out = []
  const re = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  for (const m of source.matchAll(re)) {
    out.push({ text: m[1], href: m[2] })
  }
  return out
}

function pathExists(repoPath) {
  const abs = join(repoRoot, repoPath.replace(/\/$/, ""))
  return existsSync(abs)
}

const errors = []
const headingBySlug = new Map()
for (const slug of PUBLISHED) {
  const source = readFileSync(join(docsDir, `${slug}.md`), "utf8")
  headingBySlug.set(slug, headingIdsFromMarkdown(source))
}

for (const slug of PUBLISHED) {
  const source = readFileSync(join(docsDir, `${slug}.md`), "utf8")
  const ids = headingBySlug.get(slug)

  for (const { href } of extractHrefs(source)) {
    const loc = `docs/${slug}.md → (${href})`

    if (href.startsWith("#")) {
      const id = href.slice(1)
      if (!ids.has(id)) errors.push(`${loc}: unknown in-page anchor #${id}`)
      continue
    }

    if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) {
      continue
    }

    const rewritten = rewriteDocHref(href)
    if (!rewritten) {
      errors.push(`${loc}: rewrite returned empty`)
      continue
    }

    // Catch the old bug: ../README.md becoming docs/README.md
    if (
      href.startsWith("../") &&
      rewritten.includes("/blob/main/docs/") &&
      !href.includes("/docs/")
    ) {
      errors.push(`${loc}: rewrite incorrectly scoped under docs/ → ${rewritten}`)
    }

    if (rewritten.startsWith("/docs/")) {
      const [path, hash] = rewritten.slice("/docs/".length).split("#")
      if (!publishedSet.has(path)) {
        errors.push(`${loc}: unpublished slug /docs/${path}`)
      } else if (hash && !headingBySlug.get(path)?.has(hash)) {
        errors.push(`${loc}: missing heading #${hash} in docs/${path}.md`)
      }
      continue
    }

    const blobPrefix = `${GITHUB_BLOB}/`
    if (rewritten.startsWith(blobPrefix)) {
      const rest = rewritten.slice(blobPrefix.length)
      const [repoPath] = rest.split("#")
      const hash = rest.includes("#") ? rest.slice(rest.indexOf("#") + 1) : ""
      if (!pathExists(repoPath)) {
        errors.push(`${loc}: missing repo path ${repoPath}`)
      } else if (hash && repoPath.endsWith(".md")) {
        const targetIds = headingIdsFromMarkdown(readFileSync(join(repoRoot, repoPath), "utf8"))
        if (!targetIds.has(hash)) {
          errors.push(`${loc}: missing heading #${hash} in ${repoPath}`)
        }
      }
      continue
    }

    const rawPrefix = `${GITHUB_RAW}/`
    if (rewritten.startsWith(rawPrefix)) {
      const repoPath = rewritten.slice(rawPrefix.length)
      if (!pathExists(repoPath)) errors.push(`${loc}: missing raw path ${repoPath}`)
      continue
    }

    errors.push(`${loc}: unhandled rewrite → ${rewritten}`)
  }
}

// Sanity: published files exist; no orphan nav
for (const slug of PUBLISHED) {
  if (!existsSync(join(docsDir, `${slug}.md`))) {
    errors.push(`catalog slug missing file: docs/${slug}.md`)
  }
}

if (errors.length) {
  console.error(
    `Doc link check failed (${errors.length}):\n` + errors.map((e) => `  - ${e}`).join("\n"),
  )
  process.exit(1)
}

console.log(`Doc link check OK (${PUBLISHED.length} pages).`)
