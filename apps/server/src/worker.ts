import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Schedule } from "effect"
import { loadConfigOrExit } from "./config.ts"
import { Health } from "./health.ts"
import { withConfig } from "./runtime.ts"

export const heartbeatFile =
  process.env.WORKER_HEARTBEAT_FILE ?? join(tmpdir(), "placard-worker-heartbeat")

const beat = Effect.gen(function* () {
  const health = yield* Health
  const report = yield* health.check
  if (report.status === "ok") {
    yield* Effect.promise(() => writeFile(heartbeatFile, new Date().toISOString()))
  } else {
    yield* Effect.logWarning("Worker health check failed", report.checks)
  }
})

const program = Effect.gen(function* () {
  yield* Effect.log("Placard worker started")
  yield* beat.pipe(Effect.repeat(Schedule.spaced("10 seconds")))
})

if (import.meta.main) {
  const config = Effect.runSync(loadConfigOrExit)
  NodeRuntime.runMain(program.pipe(Effect.provide(withConfig(config))))
}
