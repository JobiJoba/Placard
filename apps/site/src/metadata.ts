import { getDocMeta } from "./docs/catalog"

export const SITE_ORIGIN = "https://placard.fyi"
export function pageMetadata(pathname: string) {
  const path = pathname.replace(/\/$/, "") || "/"
  const doc = path.startsWith("/docs/") ? getDocMeta(path.slice(6)) : null
  const title = doc
    ? `${doc.title} · Placard`
    : path === "/docs"
      ? "Documentation · Placard"
      : path === "/plugins"
        ? "Plugins · Placard"
        : path === "/"
          ? "Placard — Good places. Worth keeping."
          : "Page not found · Placard"
  const description =
    doc?.summary ??
    (path === "/docs"
      ? "Install, run, and extend your self-hosted Placard library."
      : path === "/plugins"
        ? "Discover plugins for your Placard library."
        : "A self-hosted library for places worth keeping. Import saved places, organize notes and photos, and share with your household.")
  return { path, title, description }
}
