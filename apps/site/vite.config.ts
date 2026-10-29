import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/** Project Pages live under /Placard/; custom domains use /. */
const base = process.env.BASE_PATH || "/"

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
})
