/**
 * Periodic GitHub plugin update checks for the worker process.
 */
import { Effect, Schedule } from "effect"
import { Modules } from "./modules.ts"

/** Wake hourly; Modules.checkUpdates respects instance interval / disable. */
export const moduleUpdateCheckSchedule = Schedule.spaced("1 hour")

export const checkModuleUpdates = Effect.gen(function* () {
  const modules = yield* Modules
  const result = yield* modules.checkUpdates()
  if (result.checked > 0) {
    yield* Effect.log("Checked GitHub modules for updates", result)
  }
}).pipe(
  Effect.catchCause((cause) =>
    Effect.logWarning("GitHub module update check failed", cause).pipe(Effect.asVoid),
  ),
)
