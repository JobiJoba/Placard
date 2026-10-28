/**
 * Background work for Placard: health heartbeat, soft-delete purge, and pg-boss jobs.
 */
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Layer, Schedule } from "effect"
import { FetchHttpClient } from "effect/http"
import { AccountsLayer } from "./accounts/layer.ts"
import { loadConfigOrExit } from "./config.ts"
import { GoogleFixtureClient } from "./google/fixture-client.ts"
import { GooglePlaces } from "./google/places.ts"
import { Health } from "./health.ts"
import { Import } from "./import/import.ts"
import { registerEnrichPlaceWorker } from "./jobs/enrich-place.ts"
import { registerImportWorkers } from "./jobs/import-jobs.ts"
import { JobQueue } from "./jobs/queue.ts"
import { Media } from "./media/media.ts"
import { Enrichment } from "./places/enrichment.ts"
import { Lists } from "./places/lists.ts"
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

/** Places, enrichment, import, media, and the job queue over the worker's database. */
const WorkerServices = Import.layer.pipe(
  Layer.provideMerge(Enrichment.layer.pipe(Layer.provide(Media.layer))),
  Layer.provideMerge(Media.layer),
  Layer.provideMerge(Lists.layer),
  Layer.provideMerge(GooglePlaces.layer),
  Layer.provideMerge(Places.layer),
  Layer.provideMerge(Tags.layer),
  Layer.provideMerge(AccountsLayer),
  Layer.provideMerge(JobQueue.layer),
)

const program = Effect.gen(function* () {
  const queue = yield* JobQueue
  const enrichment = yield* Enrichment
  const imports = yield* Import
  const runEnrich = <A, E>(effect: Effect.Effect<A, E, Enrichment>) =>
    Effect.runPromise(Effect.provideService(effect, Enrichment, enrichment))
  const runImport = <A, E>(effect: Effect.Effect<A, E, Import>) =>
    Effect.runPromise(Effect.provideService(effect, Import, imports))

  yield* registerEnrichPlaceWorker(queue.boss, runEnrich)
  yield* registerImportWorkers(queue.boss, runImport)
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
  const http = config.fakeGoogle ? GoogleFixtureClient : FetchHttpClient.layer
  NodeRuntime.runMain(
    program.pipe(
      Effect.provide(WorkerServices),
      Effect.provide(http),
      Effect.provide(withConfig(config)),
    ),
  )
}
