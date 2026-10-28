import { Duration, Effect, Schedule } from "effect"
import { Media } from "../media/media.ts"
import { Places } from "./places.ts"

/** Soft-deleted places older than {@link Places}' purge window are removed for good, with media files. */
export const purgeDeletedPlaces = Effect.gen(function* () {
  const places = yield* Places
  const media = yield* Media
  const expired = yield* places.listExpiredDeleted
  if (expired.length === 0) return 0
  yield* media.unlinkForPlaces(expired)
  const purged = yield* places.purgeExpired
  if (purged > 0) yield* Effect.log(`Purged ${purged} deleted place(s)`)
  return purged
}).pipe(Effect.withSpan("purgeDeletedPlaces"))

export const purgeSchedule = Schedule.spaced(Duration.hours(1))
