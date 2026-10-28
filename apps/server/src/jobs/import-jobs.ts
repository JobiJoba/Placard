import { Effect } from "effect"
import type PgBoss from "pg-boss"
import { Import } from "../import/import.ts"
import { IMPORT_COMMIT, IMPORT_PARSE, type ImportCommitJob, type ImportParseJob } from "./names.ts"

type Run = <A, E>(effect: Effect.Effect<A, E, Import>) => Promise<A>

export const registerImportWorkers = (boss: PgBoss, run: Run) =>
  Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: () =>
        boss.work<ImportParseJob>(
          IMPORT_PARSE,
          { includeMetadata: true, batchSize: 1, pollingIntervalSeconds: 1 },
          async ([job]) => {
            if (!job) return
            await run(Effect.flatMap(Import, (imp) => imp.runParseJob(job.data.runId)))
          },
        ),
      catch: (cause) => new Error(`Failed to register import.parse worker: ${String(cause)}`),
    }).pipe(Effect.asVoid, Effect.orDie)

    yield* Effect.tryPromise({
      try: () =>
        boss.work<ImportCommitJob>(
          IMPORT_COMMIT,
          { includeMetadata: true, batchSize: 1, pollingIntervalSeconds: 1 },
          async ([job]) => {
            if (!job) return
            await run(Effect.flatMap(Import, (imp) => imp.runCommitJob(job.data.runId)))
          },
        ),
      catch: (cause) => new Error(`Failed to register import.commit worker: ${String(cause)}`),
    }).pipe(Effect.asVoid, Effect.orDie)
  })
