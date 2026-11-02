import type { ModuleHostFetch } from "@placard/module-sdk"

/** Reach the app directly, even when its public port/domain belongs to a proxy. */
export const createModuleHostFetch = (
  request: Request,
  publicUrl: URL,
  port: number,
  fetchImpl: typeof globalThis.fetch,
): ModuleHostFetch => {
  const requestOrigin = new URL(request.url).origin
  return (path, init) => {
    const url = new URL(path, request.url)
    if (url.origin === requestOrigin || url.origin === publicUrl.origin) {
      url.protocol = "http:"
      url.hostname = "127.0.0.1"
      url.port = String(port)
    }
    const headers = new Headers(init?.headers)
    const cookie = request.headers.get("cookie")
    if (cookie) headers.set("cookie", cookie)
    if (!headers.has("origin")) headers.set("origin", publicUrl.origin)
    if (init?.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json")
    }
    return fetchImpl(url, { ...init, headers })
  }
}
