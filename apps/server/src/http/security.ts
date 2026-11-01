import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"

/** Largest request body accepted by the API, base64-wrapped uploads included. */
export const MAX_REQUEST_BODY_BYTES = 72 * 1024 * 1024

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Maps JS injects inline tags; plugin browser code is served from 'self'.
  "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  // User media, Google photos, OSM tiles and plugin artwork can be remote.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Maps/Places, tile lookups and plugin APIs are all HTTPS.
  "connect-src 'self' https:",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ")

/**
 * Safe defaults for every response, including static files, media and the
 * Better Auth handler. HSTS is sent unconditionally: browsers ignore it over
 * plain HTTP, and self-hosters normally terminate TLS at a reverse proxy.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(self)",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
}

const withSecurityHeaders = (response: HttpServerResponse.HttpServerResponse) =>
  HttpServerResponse.setHeaders(response, SECURITY_HEADERS)

export const isBodyTooLarge = (contentLength: string | undefined): boolean => {
  if (contentLength === undefined) return false
  const length = Number(contentLength)
  return Number.isFinite(length) && length > MAX_REQUEST_BODY_BYTES
}

/**
 * Global middleware: reject oversized bodies from their declared length, then
 * attach security headers to every response.
 *
 * Chunked requests without `content-length` are not capped here; uploads from
 * the app always send a length, and the import/media/module services enforce
 * their own byte limits after decoding.
 */
export const SecurityHeadersLive = HttpRouter.middleware(
  (app) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      if (isBodyTooLarge(request.headers["content-length"])) {
        return withSecurityHeaders(
          HttpServerResponse.text("Request body is too large.", { status: 413 }),
        )
      }
      return withSecurityHeaders(yield* app)
    }),
  { global: true },
)
