import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { buildReport, DATABASE_TIMEOUT, runCheck } from "./health.ts"

describe("runCheck", () => {
  it.effect("reports success with latency", () =>
    Effect.gen(function* () {
      const fiber = yield* runCheck(Effect.sleep("150 millis")).pipe(Effect.forkChild)
      yield* TestClock.adjust("150 millis")
      const result = yield* Fiber.join(fiber)

      expect(result).toEqual({ ok: true, latencyMs: 150 })
    }),
  )

  it.effect("reports the failure message", () =>
    Effect.gen(function* () {
      const result = yield* runCheck(Effect.fail(new Error("connection refused")))
      expect(result).toEqual({ ok: false, latencyMs: 0, error: "connection refused" })
    }),
  )

  it.effect("reports a plain object failure", () =>
    Effect.gen(function* () {
      const result = yield* runCheck(Effect.fail({ message: "role does not exist" }))
      expect(result.ok).toBe(false)
      expect(result.ok === false && result.error).toBe("role does not exist")
    }),
  )

  it.effect("times out a probe that never answers", () =>
    Effect.gen(function* () {
      const fiber = yield* runCheck(Effect.never).pipe(Effect.forkChild)
      yield* TestClock.adjust(DATABASE_TIMEOUT)
      const result = yield* Fiber.join(fiber)

      expect(result.ok).toBe(false)
      expect(result.ok === false && result.error).toContain("timed out")
      expect(result.latencyMs).toBe(2000)
    }),
  )
})

describe("buildReport", () => {
  it("is ok when the database check passes", () => {
    expect(buildReport({ ok: true, latencyMs: 3 }).status).toBe("ok")
  })

  it("is an error when the database check fails", () => {
    expect(buildReport({ ok: false, latencyMs: 3, error: "down" }).status).toBe("error")
  })
})
