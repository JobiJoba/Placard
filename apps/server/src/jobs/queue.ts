import { Context, Effect, Layer, Redacted } from "effect"
import { PgBoss } from "pg-boss"
import { AppConfig } from "../config.ts"
import { migrateV10Jobs, queueSchema } from "./migrate-v10.ts"
import {
  ENRICH_PLACE,
  type EnrichPlaceJob,
  enrichPlaceOptions,
  IMPORT_COMMIT,
  IMPORT_PARSE,
  type ImportCommitJob,
  type ImportParseJob,
  importJobOptions,
} from "./names.ts"

export interface EnqueueEnrichOptions {
  /** Soft rate-limit: delay this many seconds before the job becomes eligible. */
  readonly startAfterSeconds?: number
}

/** Postgres-backed job queue (pg-boss). The API process enqueues; the worker consumes. */
export class JobQueue extends Context.Service<
  JobQueue,
  {
    readonly enqueueEnrichPlace: (
      payload: EnrichPlaceJob,
      options?: EnqueueEnrichOptions,
    ) => Effect.Effect<void>
    readonly enqueueImportParse: (payload: ImportParseJob) => Effect.Effect<void>
    readonly enqueueImportCommit: (payload: ImportCommitJob) => Effect.Effect<void>
    readonly boss: PgBoss
  }
>()("placard/JobQueue") {
  static readonly layer = Layer.effect(
    JobQueue,
    Effect.gen(function* () {
      const { databaseUrl } = yield* AppConfig
      const boss = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const instance = new PgBoss({
              connectionString: Redacted.value(databaseUrl),
              schema: queueSchema,
              application_name: "placard-jobs",
              // pg-boss coordinates supervision across API and worker instances.
              // Keep it enabled to recover abandoned jobs and enforce retention.
              supervise: true,
              schedule: false,
            })
            instance.on("error", (error) => {
              console.error("pg-boss error", error)
            })
            try {
              await instance.start()
              await instance.createQueue(ENRICH_PLACE, enrichPlaceOptions)
              await instance.createQueue(IMPORT_PARSE, importJobOptions)
              await instance.createQueue(IMPORT_COMMIT, importJobOptions)
              await migrateV10Jobs(instance.getDb())
            } catch (error) {
              await instance.stop()
              throw error
            }
            return instance
          },
          catch: (cause) => new Error(`Failed to start job queue: ${String(cause)}`),
        }).pipe(Effect.orDie),
        (instance) =>
          Effect.tryPromise({
            try: () => instance.stop({ graceful: true, timeout: 5_000 }),
            catch: () => undefined,
          }).pipe(Effect.asVoid, Effect.orDie),
      )

      return {
        boss,
        enqueueEnrichPlace: (payload: EnrichPlaceJob, options?: EnqueueEnrichOptions) =>
          Effect.tryPromise({
            try: () =>
              boss.send(ENRICH_PLACE, payload, {
                ...enrichPlaceOptions,
                ...(options?.startAfterSeconds !== undefined
                  ? { startAfter: options.startAfterSeconds }
                  : {}),
                singletonKey: payload.runId
                  ? `${payload.runId}:${payload.placeId}`
                  : payload.placeId,
              }),
            catch: (cause) => new Error(`Failed to enqueue enrich.place: ${String(cause)}`),
          }).pipe(Effect.asVoid, Effect.orDie),
        enqueueImportParse: (payload: ImportParseJob) =>
          Effect.tryPromise({
            try: () =>
              boss.send(IMPORT_PARSE, payload, {
                ...importJobOptions,
                singletonKey: payload.runId,
              }),
            catch: (cause) => new Error(`Failed to enqueue import.parse: ${String(cause)}`),
          }).pipe(Effect.asVoid, Effect.orDie),
        enqueueImportCommit: (payload: ImportCommitJob) =>
          Effect.tryPromise({
            try: () =>
              boss.send(IMPORT_COMMIT, payload, {
                ...importJobOptions,
                singletonKey: payload.runId,
              }),
            catch: (cause) => new Error(`Failed to enqueue import.commit: ${String(cause)}`),
          }).pipe(Effect.asVoid, Effect.orDie),
      }
    }),
  )
}
