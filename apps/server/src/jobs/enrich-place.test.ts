import { describe, expect, it } from "@effect/vitest"
import { GooglePlacesFailed, PlaceNotFound } from "@placard/domain"
import { Duration, Effect, Exit, Schedule } from "effect"

/**
 * Contract for enrich.place retries: rate-limit failures retry; PlaceNotFound does not.
 * The worker uses the same classification via isRetryable in enrich-place.ts.
 */
describe("enrich.place retry policy", () => {
  it("retries RESOURCE_EXHAUSTED then succeeds", async () => {
    let calls = 0
    const effect = Effect.gen(function* () {
      calls += 1
      if (calls === 1) {
        return yield* new GooglePlacesFailed({
          message: "Google Places: RESOURCE_EXHAUSTED: rate limit",
        })
      }
      return "ok" as const
    }).pipe(
      Effect.retry({
        times: 5,
        schedule: Schedule.spaced(Duration.millis(1)),
        while: (error) =>
          error._tag === "GooglePlacesFailed" && error.message.includes("RESOURCE_EXHAUSTED"),
      }),
    )
    await expect(Effect.runPromise(effect)).resolves.toBe("ok")
    expect(calls).toBe(2)
  })

  it("does not retry PlaceNotFound", async () => {
    let calls = 0
    const effect = Effect.gen(function* () {
      calls += 1
      return yield* new PlaceNotFound()
    }).pipe(
      Effect.retry({
        times: 5,
        schedule: Schedule.spaced(Duration.millis(1)),
        while: (error) => error._tag !== "PlaceNotFound",
      }),
    )
    const exit = await Effect.runPromiseExit(effect)
    expect(Exit.isFailure(exit)).toBe(true)
    expect(calls).toBe(1)
  })
})
