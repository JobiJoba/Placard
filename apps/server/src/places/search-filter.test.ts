import { describe, expect, it } from "@effect/vitest"
import { SearchFilter } from "@placard/domain"
import { Effect, Schema } from "effect"

describe("SearchFilter", () => {
  it.effect("round-trips a full filter through encode/decode", () =>
    Effect.gen(function* () {
      const filter = {
        text: "pizza",
        category: "restaurant" as const,
        open: "now" as const,
        near: { lat: 40.85, lng: 14.27 },
        radiusKm: 5,
        tag: "date-night",
        list: "0199a1b2-0000-7000-8000-000000000099",
        status: "want_to_go" as const,
      }
      const encoded = yield* Schema.encodeEffect(SearchFilter)(filter)
      const decoded = yield* Schema.decodeUnknownEffect(SearchFilter)(encoded)
      expect(decoded).toEqual(filter)
    }),
  )

  it.effect("accepts an empty filter", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(SearchFilter)({})
      expect(decoded).toEqual({})
    }),
  )

  it.effect("rejects a zero or negative radius", () =>
    Effect.gen(function* () {
      const zero = yield* Schema.decodeUnknownEffect(SearchFilter)({ radiusKm: 0 }).pipe(
        Effect.result,
      )
      expect(zero._tag).toBe("Failure")
      const negative = yield* Schema.decodeUnknownEffect(SearchFilter)({ radiusKm: -1 }).pipe(
        Effect.result,
      )
      expect(negative._tag).toBe("Failure")
    }),
  )
})
