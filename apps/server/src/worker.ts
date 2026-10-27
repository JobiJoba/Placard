/**
 * Background work for Placard. Today: health heartbeat + soft-delete purge.
 * Later phases add pg-boss jobs here.
 */
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Layer, Schedule } from "effect"
import { loadConfigOrExit } from "./config.ts"
import { Health } from "./health.ts"
import { Places } from "./places/places.ts"
import { purgeDeletedPlaces, purgeSchedule } from "./places/purge.ts"
import { Tags } from "./places/tags.ts"
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

/** Places over the worker's database; no Google client needed. */
const WorkerServices = Places.layer.pipe(Layer.provideMerge(Tags.layer))

const program = Effect.gen(function* () {
  yield* Effect.log("Placard worker started")
  yield* Effect.all(
    [
      beat.pipe(Effect.repeat(Schedule.spaced("10 seconds"))),
      purgeDeletedPlaces.pipe(Effect.repeat(purgeSchedule)),
    ],
    { concurrency: "unbounded", discard: true },
  )
})

if (import.meta.main) {
  const config = Effect.runSync(loadConfigOrExit)
  NodeRuntime.runMain(
    program.pipe(Effect.provide(WorkerServices), Effect.provide(withConfig(config))),
  )
}
