import { describe, expect, it } from "@effect/vitest"
import { createRateLimiter } from "./rate-limit.ts"

describe("MCP rate limiter", () => {
  it("allows up to the limit then blocks", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 })
    expect(limiter.allow("a")).toBe(true)
    expect(limiter.allow("a")).toBe(true)
    expect(limiter.allow("a")).toBe(true)
    expect(limiter.allow("a")).toBe(false)
    expect(limiter.allow("b")).toBe(true)
  })
})
