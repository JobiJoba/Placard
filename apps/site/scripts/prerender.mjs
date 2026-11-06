import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { pageMetadata, render, routes, SITE_ORIGIN } from "../.prerender/entry-server.js"

const root = fileURLToPath(new URL("../", import.meta.url))
const dist = resolve(root, "dist")
const template = await readFile(resolve(dist, "index.html"), "utf8")
const escapeHtml = (value) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
function page(path) {
  const meta = pageMetadata(path)
  return template
    .replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(meta.title)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
      `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    )
    .replace("</head>", `<link rel="canonical" href="${SITE_ORIGIN}${meta.path}" /></head>`)
    .replace('<div id="root"></div>', () => `<div id="root">${render(path)}</div>`)
}
for (const path of routes) {
  const directory = resolve(dist, `.${path}`)
  await mkdir(directory, { recursive: true })
  await writeFile(resolve(directory, "index.html"), page(path))
}
// Static alias: Pages cannot issue custom HTTP redirects, so preserve the old install link.
await mkdir(resolve(dist, "install"), { recursive: true })
await writeFile(
  resolve(dist, "install/index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/docs/install"><link rel="canonical" href="${SITE_ORIGIN}/docs/install"><title>Install · Placard</title></head><body><a href="/docs/install">Installation guide</a></body></html>`,
)
await writeFile(
  resolve(dist, "404.html"),
  page("/404").replace("</head>", '<meta name="robots" content="noindex" /></head>'),
)
await writeFile(resolve(dist, ".nojekyll"), "")
await writeFile(
  resolve(dist, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map((path) => `<url><loc>${SITE_ORIGIN}${path}</loc></url>`).join("")}</urlset>\n`,
)
await writeFile(
  resolve(dist, "robots.txt"),
  `User-agent: *\nAllow: /\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
)
await rm(resolve(root, ".prerender"), { recursive: true, force: true })
console.log(`Prerendered ${routes.length} public routes`)
