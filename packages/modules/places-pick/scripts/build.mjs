#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import * as esbuild from "esbuild"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const packDir = join(root, "pack")
const distZipParent = join(root, "dist")

rmSync(packDir, { recursive: true, force: true })
mkdirSync(join(packDir, "server"), { recursive: true })
mkdirSync(join(packDir, "web"), { recursive: true })
mkdirSync(distZipParent, { recursive: true })

cpSync(join(root, "placard.module.json"), join(packDir, "placard.module.json"))

const shimReact = join(root, "src/web/shims/react.ts")
const shimJsx = join(root, "src/web/shims/jsx-runtime.ts")
const shimRouter = join(root, "src/web/shims/react-router.ts")

await esbuild.build({
  entryPoints: [join(root, "src/server/index.ts")],
  outfile: join(packDir, "server/index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  // Fully self-contained — uploaded zips have no node_modules resolution to the host.
  logLevel: "info",
})

await esbuild.build({
  entryPoints: [join(root, "src/web/index.ts")],
  outfile: join(packDir, "web/index.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  alias: {
    react: shimReact,
    "react/jsx-runtime": shimJsx,
    "react-router": shimRouter,
  },
  logLevel: "info",
})

const webAssets = join(root, "src/web/assets")
if (existsSync(webAssets)) {
  mkdirSync(join(packDir, "web/assets"), { recursive: true })
  cpSync(webAssets, join(packDir, "web/assets"), { recursive: true })
}

writeFileSync(
  join(packDir, "README.md"),
  `# places.pick

Upload this zip in Placard → Settings → Module marketplace.

Requires a Placard image that supports plugin upload + the \`__PLACARD_PLUGIN__\` web bridge.
`,
)

// Zip via root placard-pack script helper (fflate from server)
const { pathToFileURL } = await import("node:url")
const fflateUrl = pathToFileURL(
  join(root, "../../../apps/server/node_modules/fflate/esm/browser.js"),
).href
const { zipSync } = await import(fflateUrl)
const { readdirSync, readFileSync, statSync } = await import("node:fs")

const collect = (dir, prefix = "") => {
  const files = {}
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    const rel = prefix ? `${prefix}/${name}` : name
    if (statSync(abs).isDirectory()) Object.assign(files, collect(abs, rel))
    else files[rel] = new Uint8Array(readFileSync(abs))
  }
  return files
}

const files = collect(packDir)
const zipped = zipSync(files, { level: 6 })
const outZip = join(distZipParent, "places.pick-0.1.1.zip")
writeFileSync(outZip, Buffer.from(zipped))
console.log(`Packed ${outZip} (${Object.keys(files).length} files)`)
