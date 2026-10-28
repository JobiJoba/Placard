import * as React from "react"
import { StrictMode } from "react"
import * as jsxRuntime from "react/jsx-runtime"
import { createRoot } from "react-dom/client"
import { Link } from "react-router"
import { App } from "./App.tsx"
import "./index.css"

/** Shared React for uploaded plugin ESM (esbuild aliases react → these globals). */
;(globalThis as unknown as { __PLACARD_PLUGIN__: unknown }).__PLACARD_PLUGIN__ = {
  React,
  jsxRuntime,
  Link,
}

const root = document.getElementById("root")
if (!root) throw new Error("Root element #root not found")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
