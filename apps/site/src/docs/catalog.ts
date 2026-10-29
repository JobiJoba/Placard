export type DocNavItem = {
  slug: string
  title: string
  summary: string
}

export type DocNavGroup = {
  label: string
  items: DocNavItem[]
}

/** Operator-facing docs published on the marketing site (sourced from repo `docs/`). */
export const DOC_NAV: DocNavGroup[] = [
  {
    label: "Start",
    items: [
      {
        slug: "install",
        title: "Install",
        summary: "Docker Compose, Coolify, Dokploy, backup, and upgrades.",
      },
      {
        slug: "google-apis",
        title: "Google APIs",
        summary: "BYOK key, Places API (New), Maps JavaScript, restrictions.",
      },
    ],
  },
  {
    label: "Operate",
    items: [
      {
        slug: "deployment",
        title: "Deployment",
        summary: "Compose stack, env vars, Nextcloud adjacency, volumes.",
      },
      {
        slug: "mcp",
        title: "MCP",
        summary: "Connect Cursor/Claude with a PAT; core and module tools.",
      },
    ],
  },
  {
    label: "Extend",
    items: [
      {
        slug: "creating-modules",
        title: "Creating modules",
        summary: "Build a prebuilt zip and upload it to Marketplace.",
      },
      {
        slug: "module-brief-for-ai",
        title: "FOR AI — module brief",
        summary: "Copy-paste prompt so an agent can author a module.",
      },
      {
        slug: "architecture-modules",
        title: "How modules work",
        summary: "Core vs modules, bundled vs upload, safety rules.",
      },
      {
        slug: "takeout-format",
        title: "Takeout format",
        summary: "What Placard expects from Google Takeout exports.",
      },
    ],
  },
]

// From apps/site/src/docs → repo docs/ (four levels up to Placard/).
const rawModules = import.meta.glob("../../../../docs/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>

function slugFromPath(path: string): string {
  const file = path.split("/").pop() ?? path
  return file.replace(/\.md$/, "")
}

const bySlug = new Map<string, string>()
for (const [path, body] of Object.entries(rawModules)) {
  bySlug.set(slugFromPath(path), body)
}

export function listPublishedSlugs(): string[] {
  return DOC_NAV.flatMap((g) => g.items.map((i) => i.slug))
}

export function getDocMarkdown(slug: string): string | null {
  return bySlug.get(slug) ?? null
}

export function getDocMeta(slug: string): DocNavItem | null {
  for (const group of DOC_NAV) {
    const hit = group.items.find((i) => i.slug === slug)
    if (hit) return hit
  }
  return null
}
