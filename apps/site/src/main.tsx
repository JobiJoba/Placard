import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"
import { App } from "./App"
import "./index.css"

const el = document.getElementById("root")
if (!el) throw new Error("root element missing")

const basename = import.meta.env.BASE_URL.replace(/\/$/, "")

createRoot(el).render(
  <StrictMode>
    <BrowserRouter {...(basename ? { basename } : {})}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
