import { Duration, Effect, Schedule } from "effect"
import { Places } from "./places.ts"

/** Soft-deleted places older than {@link Places}' purge window are removed for good. */
export const purgeDeletedPlaces = Effect.gen(function* () {
  const places = yield* Places
  const purged = yield* places.purgeExpired
  if (purged > 0) yield* Effect.log(`Purged ${purged} deleted place(s)`)
  return purged
}).pipe(Effect.withSpan("purgeDeletedPlaces"))

export const purgeSchedule = Schedule.spaced(Duration.hours(1))
