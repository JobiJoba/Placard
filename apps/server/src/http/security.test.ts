import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import {
  isBodyTooLarge,
  MAX_REQUEST_BODY_BYTES,
  SECURITY_HEADERS,
  SecurityHeadersLive,
} from "./security.ts"

const Routes = HttpRouter.add("GET", "/hello", Effect.succeed(HttpServerResponse.text("Hello")))

it("adds security headers to responses", async () => {
  const app = HttpRouter.toWebHandler(Layer.mergeAll(Routes, SecurityHeadersLive), {
    disableLogger: true,
  })
  try {
    const response = await app.handler(new Request("http://localhost/hello"))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("Hello")
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value)
    }
  } finally {
    await app.dispose()
  }
})

it("rejects requests that declare an oversized body", async () => {
  const app = HttpRouter.toWebHandler(Layer.mergeAll(Routes, SecurityHeadersLive), {
    disableLogger: true,
  })
  try {
    const response = await app.handler(
      new Request("http://localhost/hello", {
        method: "POST",
        headers: { "content-length": String(MAX_REQUEST_BODY_BYTES + 1) },
      }),
    )
    expect(response.status).toBe(413)
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  } finally {
    await app.dispose()
  }
})

it("only treats declared lengths above the cap as too large", () => {
  expect(isBodyTooLarge(undefined)).toBe(false)
  expect(isBodyTooLarge("garbage")).toBe(false)
  expect(isBodyTooLarge("0")).toBe(false)
  expect(isBodyTooLarge(String(MAX_REQUEST_BODY_BYTES))).toBe(false)
  expect(isBodyTooLarge(String(MAX_REQUEST_BODY_BYTES + 1))).toBe(true)
})
