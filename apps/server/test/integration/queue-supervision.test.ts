import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { ENRICH_PLACE } from "../../src/jobs/names.ts"
import { JobQueue } from "../../src/jobs/queue.ts"
import { IntegrationLayer } from "../layers/postgis.ts"

layer(IntegrationLayer, { timeout: 120_000 })("queue supervision", (it) => {
  it.effect(
    "automatically retries abandoned jobs and removes expired completed jobs",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const { boss } = yield* JobQueue
        const [abandoned, completed] = yield* Effect.promise(() =>
          Promise.all([
            boss.send(ENRICH_PLACE, { placeId: "abandoned" }),
            boss.send(ENRICH_PLACE, { placeId: "completed" }),
          ]),
        )
        expect(abandoned).toBeTruthy()
        expect(completed).toBeTruthy()
        // Simulate a worker dying after claiming work, and a completed job past retention.
        yield* sql`update pgboss_v12.job set state = 'active',
          started_on = now() - interval '2 hours', expire_seconds = 1
          where id = ${abandoned}`
        yield* sql`update pgboss_v12.job set state = 'completed',
          completed_on = now() - interval '30 days'
          where id = ${completed}`

        // Use the real timer: calling boss.supervise() here would hide disabled supervision.
        yield* Effect.promise(() =>
          expect
            .poll(
              async () => {
                const rows = await Effect.runPromise(
                  sql`select id, state from pgboss_v12.job
                    where id in (${abandoned}, ${completed})`,
                )
                return rows.map((row) => ({ id: row.id, state: row.state }))
              },
              { timeout: 75_000, interval: 250 },
            )
            .toEqual([{ id: abandoned, state: "retry" }]),
        )
      }).pipe(Effect.provide(JobQueue.layer)),
    90_000,
  )
})
