import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { JobQueue } from "../../src/jobs/queue.ts"
import { IntegrationLayer } from "../layers/postgis.ts"

layer(IntegrationLayer)("upgrade from pg-boss schema 24", (it) => {
  it.effect("moves interrupted work once and preserves delayed retries and completed history", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`create schema pgboss`
      yield* sql`create table pgboss.version as select 24 as version`
      yield* sql`create table pgboss.job as
        select gen_random_uuid() as id, 'import.parse' as name,
          jsonb_build_object('runId', state) as data, 1 as priority, state,
          2 as retry_limit, 1 as retry_count, 5 as retry_delay, true as retry_backoff,
          now() + interval '1 hour' as start_after, now() as started_on,
          state as singleton_key, null::timestamp as singleton_on,
          interval '30 minutes' as expire_in, now() as created_on,
          now() + interval '1 day' as keep_until, null::jsonb as output, 'standard' as policy
        from unnest(array['active', 'retry', 'completed']) as state`

      const startQueue = Effect.scoped(Effect.provide(Effect.asVoid(JobQueue), JobQueue.layer))
      yield* Effect.all([startQueue, startQueue], { concurrency: 2 })
      yield* startQueue

      expect(yield* sql`select state from pgboss.job`).toEqual([{ state: "completed" }])
      expect(
        yield* sql`select state, data->>'runId' as payload, singleton_key, retry_count,
          expire_seconds, start_after > now() as delayed, started_on is null as reset
          from pgboss_v12.job order by singleton_key`,
      ).toEqual([
        {
          state: "created",
          payload: "active",
          singleton_key: "active",
          retry_count: 1,
          expire_seconds: 1800,
          delayed: true,
          reset: true,
        },
        {
          state: "retry",
          payload: "retry",
          singleton_key: "retry",
          retry_count: 1,
          expire_seconds: 1800,
          delayed: true,
          reset: false,
        },
      ])
    }),
  )
})
