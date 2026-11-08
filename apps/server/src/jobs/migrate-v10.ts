import type { Db } from "pg-boss"

export const queueSchema = "pgboss_v12"

/** v12 cannot upgrade v10's partition layout. Move unfinished Placard jobs atomically. */
export async function migrateV10Jobs(db: Db) {
  await db.executeSql(`
    do $migration$
    begin
      if to_regclass('pgboss.job') is null then return; end if;
      if (select version from pgboss.version) <> 24 then
        raise exception 'Unexpected legacy pg-boss schema version';
      end if;

      -- API and worker may start together. Serialize the move across all three queues.
      perform pg_advisory_xact_lock(hashtextextended('placard.jobs.migrate-v10', 0));
      with moved as (
        delete from pgboss.job
        where name in ('enrich.place', 'import.parse', 'import.commit')
          and state in ('created', 'retry', 'active')
        returning *
      )
      insert into ${queueSchema}.job (
        id, name, data, priority, state, retry_limit, retry_count, retry_delay,
        retry_backoff, start_after, started_on, singleton_key, singleton_on,
        expire_seconds, created_on, keep_until, output, policy
      )
      select id, name, data, priority,
        (case when state = 'active' then 'created' else state::text end)::${queueSchema}.job_state,
        retry_limit, retry_count, retry_delay, retry_backoff, start_after,
        case when state = 'active' then null else started_on end,
        singleton_key, singleton_on, extract(epoch from expire_in)::integer,
        created_on, keep_until, output, policy
      from moved;
    end $migration$;
  `)
}
