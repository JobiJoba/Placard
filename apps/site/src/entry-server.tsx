import { renderToString } from "react-dom/server"
import { StaticRouter } from "react-router"
import { App } from "./App"
import { listPublishedSlugs } from "./docs/catalog"

export { pageMetadata, SITE_ORIGIN } from "./metadata"
export const routes = [
  "/",
  "/plugins",
  "/docs",
  ...listPublishedSlugs().map((slug) => `/docs/${slug}`),
]
export function render(path: string) {
  return renderToString(
    <StaticRouter location={path}>
      <App />
    </StaticRouter>,
  )
}
