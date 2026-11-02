/** Regenerate site and app icons from the canonical vector mark. */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const root = new URL("../", import.meta.url)
const require = createRequire(new URL("apps/server/package.json", root))
const sharp = require("sharp")
const source = await readFile(new URL("assets/brand/placard-icon.svg", root), "utf8")
// Maskable icons need an opaque full bleed and a centered safe-zone mark.
const maskable = source
  .replace(
    '<rect width="64" height="64" rx="14" fill="#1a1612"/>',
    '<rect width="64" height="64" fill="#1a1612"/><g transform="translate(7.04 7.04) scale(.78)">',
  )
  .replace("</svg>", "</g></svg>")
const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
const faviconImages = await Promise.all([16, 32, 48].map((size) => png(source, size)))
const header = Buffer.alloc(6 + 16 * faviconImages.length)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(faviconImages.length, 4)
let offset = header.length
faviconImages.forEach((data, index) => {
  const entry = 6 + index * 16
  header[entry] = header[entry + 1] = [16, 32, 48][index]
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(data.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += data.length
})
for (const app of ["site", "web"]) {
  const publicDir = new URL(`apps/${app}/public/`, root)
  await mkdir(new URL("icons/", publicDir), { recursive: true })
  await writeFile(new URL("favicon.svg", publicDir), source)
  await writeFile(new URL("favicon.ico", publicDir), Buffer.concat([header, ...faviconImages]))
  for (const size of [192, 512])
    await writeFile(new URL(`icons/icon-${size}.png`, publicDir), await png(source, size))
  await writeFile(new URL("icons/apple-touch-icon.png", publicDir), await png(maskable, 180))
  await writeFile(new URL("icons/icon-maskable-512.png", publicDir), await png(maskable, 512))
}
console.log(
  `Generated Placard icons from ${fileURLToPath(new URL("assets/brand/placard-icon.svg", root))}`,
)
