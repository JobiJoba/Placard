import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { DebugLogBuffer, DebugLoggingLive, debugView, redactLog } from "./debug.ts"

describe("debug diagnostics", () => {
  it("keeps only the latest 500 entries in newest-first order", () => {
    const buffer = new DebugLogBuffer()
    for (let index = 0; index < 510; index++) buffer.append("now", "INFO", `event ${index}`)
    const entries = buffer.snapshot()
    expect(entries).toHaveLength(500)
    expect(entries[0]?.message).toBe("event 509")
    expect(entries[499]?.message).toBe("event 10")
    entries.pop()
    expect(buffer.snapshot()).toHaveLength(500)
  })

  it("redacts credentials and bounds individual messages", () => {
    const message = redactLog(
      'Bearer abc123 apiKey="private key" password=hunter2 https://user:pass@example.com AIzaSECRET',
    )
    for (const secret of ["abc123", "private key", "hunter2", "user:pass", "AIzaSECRET"]) {
      expect(message).not.toContain(secret)
    }
    expect(redactLog("x".repeat(10_000))).toHaveLength(4_000)
  })

  it.effect("includes useful HTTP context without query strings", () =>
    Effect.gen(function* () {
      yield* Effect.log("Sent HTTP response").pipe(
        Effect.annotateLogs({
          "http.method": "GET",
          "http.url": "/api/places?token=private-query",
          "http.status": 503,
        }),
      )
      const view = yield* debugView
      expect(view.logs[0]).toMatchObject({ level: "ERROR" })
      expect(view.logs[0]?.message).toContain("GET /api/places → 503")
      expect(view.logs[0]?.message).not.toContain("private-query")
    }).pipe(Effect.provide(DebugLoggingLive)),
  )

  it.effect("captures real Effect logs and exposes runtime diagnostics", () =>
    Effect.gen(function* () {
      yield* Effect.logWarning("Debug logger test token=private-token")
      const view = yield* debugView
      expect(view.version.length).toBeGreaterThan(0)
      expect(view.nodeVersion).toBe(process.version)
      expect(view.uptimeSeconds).toBeGreaterThanOrEqual(0)
      expect(view.logs[0]).toMatchObject({ level: "WARN" })
      expect(view.logs[0]?.message).toContain("Debug logger test")
      expect(view.logs[0]?.message).not.toContain("private-token")
    }).pipe(Effect.provide(DebugLoggingLive)),
  )
})
