#!/usr/bin/env node
/**
 * Pack a prebuilt Placard module directory into a zip for Docker upload.
 *
 * Usage (from repo root):
 *   pnpm placard:pack <module-dir> [out.zip]
 *
 * Expects <module-dir> to already contain the upload layout:
 *   placard.module.json
 *   server/index.js   (ESM; createModule export; effect/@placard/* as externals)
 *   web/index.js      (browser ESM exporting page components)
 *
 * Tip: build with esbuild first, e.g.
 *   esbuild src/server/pack-entry.ts --bundle --format=esm --platform=node \
 *     --external:effect --external:@placard/* --outfile=pack/server/index.js
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const moduleDir = resolve(process.argv[2] ?? "")
if (!moduleDir || !existsSync(moduleDir)) {
  console.error("Usage: pnpm placard:pack <module-dir> [out.zip]")
  process.exit(1)
}

const manifestPath = join(moduleDir, "placard.module.json")
if (!existsSync(manifestPath)) {
  console.error("Missing placard.module.json in", moduleDir)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
const serverEntry = (manifest.serverEntry ?? "./server/index.js").replace(/^\.\//, "")
const webEntry = (manifest.webEntry ?? "./web/index.js").replace(/^\.\//, "")
if (!existsSync(join(moduleDir, serverEntry))) {
  console.error(`Missing server entry ${serverEntry}`)
  process.exit(1)
}

const collect = (dir, prefix = "") => {
  /** @type {Record<string, Uint8Array>} */
  const files = {}
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name.endsWith(".zip")) continue
    const abs = join(dir, name)
    const rel = prefix ? `${prefix}/${name}` : name
    if (statSync(abs).isDirectory()) Object.assign(files, collect(abs, rel))
    else files[rel] = new Uint8Array(readFileSync(abs))
  }
  return files
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const fflateUrl = pathToFileURL(
  join(scriptDir, "../apps/server/node_modules/fflate/esm/browser.js"),
).href
const { zipSync } = await import(fflateUrl)

const files = collect(moduleDir)
const zipped = zipSync(files, { level: 6 })
const out =
  process.argv[3] ??
  join(moduleDir, `${String(manifest.id).replace(/[^a-z0-9._-]+/gi, "-")}-${manifest.version}.zip`)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, Buffer.from(zipped))
console.log(`Wrote ${out} (${Object.keys(files).length} files, web entry ${webEntry})`)
