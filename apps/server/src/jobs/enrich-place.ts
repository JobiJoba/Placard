import { Effect } from "effect"
import type PgBoss from "pg-boss"
import { Enrichment } from "../places/enrichment.ts"
import { ENRICH_PLACE, type EnrichPlaceJob } from "./names.ts"

const isRetryable = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null || !("_tag" in error)) return true
  const tag = (error as { _tag: string })._tag
  return tag !== "PlaceNotFound" && tag !== "GoogleKeyMissing"
}

type Run = <A, E>(effect: Effect.Effect<A, E, Enrichment>) => Promise<A>

/** Register the enrich.place worker on a running pg-boss instance. */
export const registerEnrichPlaceWorker = (boss: PgBoss, run: Run) =>
  Effect.tryPromise({
    try: () =>
      boss.work<EnrichPlaceJob>(
        ENRICH_PLACE,
        { includeMetadata: true, batchSize: 1, pollingIntervalSeconds: 1 },
        async ([job]) => {
          if (!job) return
          const { placeId, ownerId, runId } = job.data
          const lastAttempt = job.retryCount >= job.retryLimit

          try {
            await run(
              Effect.gen(function* () {
                const enrichment = yield* Enrichment
                yield* enrichment.enrichPlace(ownerId, placeId, { force: true })
              }),
            )
            if (runId) {
              await run(Effect.flatMap(Enrichment, (e) => e.markJobDone(runId, true)))
            }
          } catch (error) {
            if (!isRetryable(error) || lastAttempt) {
              if (runId) {
                await run(Effect.flatMap(Enrichment, (e) => e.markJobDone(runId, false)))
              }
              if (!isRetryable(error)) return
            }
            throw error
          }
        },
      ),
    catch: (cause) => new Error(`Failed to register enrich.place worker: ${String(cause)}`),
  }).pipe(Effect.asVoid, Effect.orDie)
