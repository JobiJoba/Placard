import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(rootDir, "../..")
const repoDocs = path.resolve(repoRoot, "docs")

/** Project Pages live under /Placard/; custom domains use /. */
const base = process.env.BASE_PATH || "/"

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    fs: {
      // site app + monorepo docs + hoisted pnpm store (fonts, etc.)
      allow: [rootDir, repoDocs, path.resolve(repoRoot, "node_modules")],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
})
