import {
  type ImportCounts,
  type ImportDecision,
  type ImportEntry,
  type ImportEntryFilter,
  ImportInvalidState,
  ImportNotFound,
  type ImportRun,
  type ImportUndoPreview,
  type ImportUpload,
  TakeoutParseError,
} from "@placard/domain"
import { Context, DateTime, Effect, Layer, Option } from "effect"
import { SqlClient } from "effect/sql"
import { v7 as uuidv7 } from "uuid"
import { GooglePlaces } from "../google/places.ts"
import { JobQueue } from "../jobs/queue.ts"
import { Enrichment } from "../places/enrichment.ts"
import { Lists } from "../places/lists.ts"
import { Places } from "../places/places.ts"
import { decodeBase64Zip, parseTakeoutFiles, type TakeoutFile, unzipTakeout } from "./parse.ts"

interface RunRow {
  readonly id: string
  readonly status: ImportRun["status"]
  readonly source_fingerprint: string
  readonly counts: ImportCounts
  readonly error_message: string | null
  readonly created_at: Date
  readonly committed_at: Date | null
  readonly undone_at: Date | null
}

interface EntryRow {
  readonly id: string
  readonly run_id: string
  readonly dedupe_key: string
  readonly source_file: string
  readonly source_list: string | null
  readonly name: string | null
  readonly address: string | null
  readonly country_code: string | null
  readonly note: string | null
  readonly lat: number | null
  readonly lng: number | null
  readonly google_maps_url: string | null
  readonly cid: string | null
  readonly feature_id: string | null
  readonly saved_at: Date | null
  readonly decision: ImportDecision
  readonly match_status: ImportEntry["matchStatus"]
  readonly place_id: string | null
  readonly already_in_library: boolean
  readonly cross_list_duplicate: boolean
}

const emptyCounts = (): ImportCounts => ({
  parsed: 0,
  kept: 0,
  skipped: 0,
  matched: 0,
  needsReview: 0,
  pending: 0,
})

const toRun = (row: RunRow): ImportRun => ({
  id: row.id,
  status: row.status,
  sourceFingerprint: row.source_fingerprint,
  counts: row.counts,
  expectedApiCalls: row.counts.kept,
  createdAt: DateTime.fromDateUnsafe(row.created_at),
  committedAt: row.committed_at ? DateTime.fromDateUnsafe(row.committed_at) : null,
  undoneAt: row.undone_at ? DateTime.fromDateUnsafe(row.undone_at) : null,
  errorMessage: row.error_message,
})

const toEntry = (row: EntryRow): ImportEntry => ({
  id: row.id,
  runId: row.run_id,
  dedupeKey: row.dedupe_key,
  sourceFile: row.source_file,
  sourceList: row.source_list,
  name: row.name,
  address: row.address,
  countryCode: row.country_code,
  note: row.note,
  location: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null,
  googleMapsUrl: row.google_maps_url,
  cid: row.cid,
  featureId: row.feature_id,
  savedAt: row.saved_at ? DateTime.fromDateUnsafe(row.saved_at) : null,
  decision: row.decision,
  matchStatus: row.match_status,
  placeId: row.place_id,
  alreadyInLibrary: row.already_in_library,
  crossListDuplicate: row.cross_list_duplicate,
  needsLocation: row.lat === null || row.lng === null,
})

const filesFromUpload = (upload: ImportUpload): Effect.Effect<TakeoutFile[], TakeoutParseError> =>
  Effect.try({
    try: () => {
      if (upload.kind === "files") return [...upload.files]
      const files = unzipTakeout(decodeBase64Zip(upload.contentBase64))
      if (files.length === 0) {
        throw new Error("Zip has no Saved Places.json or Saved/*.csv files")
      }
      return files
    },
    catch: (cause) =>
      new TakeoutParseError({
        message: cause instanceof Error ? cause.message : "Could not read the Takeout upload",
      }),
  })

/** Takeout import: free parse/triage, then commit matching + enrichment. */
export class Import extends Context.Service<
  Import,
  {
    readonly start: (
      ownerId: string,
      upload: ImportUpload,
    ) => Effect.Effect<ImportRun, TakeoutParseError>
    readonly listRuns: (ownerId: string) => Effect.Effect<ReadonlyArray<ImportRun>>
    readonly getRun: (ownerId: string, runId: string) => Effect.Effect<ImportRun, ImportNotFound>
    readonly listEntries: (
      ownerId: string,
      runId: string,
      filter?: ImportEntryFilter,
    ) => Effect.Effect<ReadonlyArray<ImportEntry>, ImportNotFound>
    readonly setDecisions: (
      ownerId: string,
      runId: string,
      entryIds: ReadonlyArray<string>,
      decision: ImportDecision,
    ) => Effect.Effect<ImportRun, ImportNotFound | ImportInvalidState>
    readonly setListDecision: (
      ownerId: string,
      runId: string,
      sourceList: string,
      decision: ImportDecision,
    ) => Effect.Effect<ImportRun, ImportNotFound | ImportInvalidState>
    readonly commit: (
      ownerId: string,
      runId: string,
    ) => Effect.Effect<ImportRun, ImportNotFound | ImportInvalidState>
    readonly undoPreview: (
      ownerId: string,
      runId: string,
    ) => Effect.Effect<ImportUndoPreview, ImportNotFound | ImportInvalidState>
    readonly undo: (
      ownerId: string,
      runId: string,
      confirmEdited: boolean,
    ) => Effect.Effect<ImportRun, ImportNotFound | ImportInvalidState>
    readonly runParseJob: (runId: string) => Effect.Effect<void>
    readonly runCommitJob: (runId: string) => Effect.Effect<void>
  }
>()("placard/Import") {
  static readonly layer = Layer.effect(
    Import,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const places = yield* Places
      const lists = yield* Lists
      const google = yield* GooglePlaces
      const enrichment = yield* Enrichment
      const jobs = yield* JobQueue
      const point = (lat: number, lng: number) =>
        sql`st_setsrid(st_makepoint(${lng}, ${lat}), 4326)::geography`

      const loadRun = (ownerId: string, runId: string) =>
        sql<RunRow>`
          select id, status, source_fingerprint, counts, error_message,
                 created_at, committed_at, undone_at
          from import_runs
          where id = ${runId} and owner_id = ${ownerId}`.pipe(
          Effect.orDie,
          Effect.flatMap((rows) => (rows[0] ? Effect.succeed(rows[0]) : new ImportNotFound())),
        )

      const loadRunById = (runId: string) =>
        sql<RunRow & { owner_id: string }>`
          select id, owner_id, status, source_fingerprint, counts, error_message,
                 created_at, committed_at, undone_at
          from import_runs where id = ${runId}`.pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows[0] ? Effect.succeed(rows[0]) : Effect.die(`import run ${runId} missing`),
          ),
        )

      const recount = (runId: string) =>
        Effect.gen(function* () {
          const [row] = yield* sql<{
            parsed: number
            kept: number
            skipped: number
            matched: number
            needs_review: number
            pending: number
          }>`
            select
              count(*)::int as parsed,
              count(*) filter (where decision = 'keep')::int as kept,
              count(*) filter (where decision = 'skip')::int as skipped,
              count(*) filter (where match_status = 'matched')::int as matched,
              count(*) filter (where match_status = 'needs_review')::int as needs_review,
              count(*) filter (where decision = 'pending')::int as pending
            from import_entries where run_id = ${runId}`.pipe(Effect.orDie)
          const counts: ImportCounts = {
            parsed: row?.parsed ?? 0,
            kept: row?.kept ?? 0,
            skipped: row?.skipped ?? 0,
            matched: row?.matched ?? 0,
            needsReview: row?.needs_review ?? 0,
            pending: row?.pending ?? 0,
          }
          yield* sql`
            update import_runs set counts = ${JSON.stringify(counts)}::jsonb
            where id = ${runId}`.pipe(Effect.orDie)
          return counts
        })

      const entrySelect = sql`
        e.id, e.run_id, e.dedupe_key, e.source_file, e.source_list, e.name, e.address,
        e.country_code, e.note,
        st_y(e.location::geometry) as lat, st_x(e.location::geometry) as lng,
        e.google_maps_url, e.cid, e.feature_id, e.saved_at, e.decision, e.match_status, e.place_id,
        exists (
          select 1 from places p
          where p.owner_id = e.owner_id and p.deleted_at is null
            and e.name is not null and lower(p.name) = lower(e.name)
            and (
              e.location is null
              or st_dwithin(p.location, e.location, 50)
            )
        ) as already_in_library,
        exists (
          select 1 from import_entries o
          where o.run_id = e.run_id and o.dedupe_key = e.dedupe_key and o.id <> e.id
        ) as cross_list_duplicate`

      const fillStaging = (ownerId: string, runId: string, files: ReadonlyArray<TakeoutFile>) =>
        Effect.gen(function* () {
          const parsed = yield* Effect.try({
            try: () => parseTakeoutFiles(files),
            catch: (cause) =>
              new TakeoutParseError({
                message: cause instanceof Error ? cause.message : "Takeout parse failed",
              }),
          })

          const skips = yield* sql<{ dedupe_key: string }>`
            select dedupe_key from import_skips where owner_id = ${ownerId}`.pipe(Effect.orDie)
          const skipSet = new Set(skips.map((s) => s.dedupe_key))

          for (const entry of parsed.entries) {
            const decision = skipSet.has(entry.dedupeKey) ? "skip" : "pending"
            yield* sql`
              insert into import_entries (
                id, run_id, owner_id, dedupe_key, source_file, source_list, name, address,
                country_code, note, location, google_maps_url, cid, feature_id, saved_at, decision
              ) values (
                ${uuidv7()}, ${runId}, ${ownerId}, ${entry.dedupeKey}, ${entry.sourceFile},
                ${entry.sourceList}, ${entry.name}, ${entry.address}, ${entry.countryCode},
                ${entry.note},
                ${entry.location ? point(entry.location.lat, entry.location.lng) : null},
                ${entry.googleMapsUrl}, ${entry.cid}, ${entry.featureId},
                ${entry.savedAt}, ${decision}
              )
              on conflict (run_id, dedupe_key, source_file) do nothing`.pipe(Effect.orDie)
          }

          yield* sql`
            update import_runs set
              status = 'triage',
              source_fingerprint = ${parsed.fingerprint},
              error_message = null
            where id = ${runId}`.pipe(Effect.orDie)
          yield* recount(runId)
        })

      const applyDecisions = (
        ownerId: string,
        runId: string,
        entryIds: ReadonlyArray<string>,
        decision: ImportDecision,
      ) =>
        Effect.gen(function* () {
          const run = yield* loadRun(ownerId, runId)
          if (run.status !== "triage") {
            return yield* new ImportInvalidState({
              message: "Decisions can only change while the import is in triage.",
            })
          }
          if (entryIds.length === 0) return toRun(run)
          yield* sql`
            update import_entries set decision = ${decision}
            where run_id = ${runId} and owner_id = ${ownerId}
              and ${sql.in("id", entryIds)}`.pipe(Effect.orDie)

          const keys = yield* sql<{ dedupe_key: string }>`
            select distinct dedupe_key from import_entries
            where run_id = ${runId} and ${sql.in("id", entryIds)}`.pipe(Effect.orDie)

          if (decision === "skip") {
            for (const { dedupe_key } of keys) {
              yield* sql`
                insert into import_skips (owner_id, dedupe_key)
                values (${ownerId}, ${dedupe_key})
                on conflict do nothing`.pipe(Effect.orDie)
            }
          } else if (keys.length > 0) {
            yield* sql`
              delete from import_skips
              where owner_id = ${ownerId}
                and ${sql.in(
                  "dedupe_key",
                  keys.map((k) => k.dedupe_key),
                )}`.pipe(Effect.orDie)
          }

          yield* recount(runId)
          return toRun(yield* loadRun(ownerId, runId))
        })

      const buildUndoPreview = (ownerId: string, runId: string) =>
        Effect.gen(function* () {
          const run = yield* loadRun(ownerId, runId)
          if (run.status !== "done") {
            return yield* new ImportInvalidState({
              message: "Only a finished import can be undone.",
            })
          }
          const placeCount = yield* sql<{ n: number }>`
            select count(*)::int as n from places
            where owner_id = ${ownerId} and import_run_id = ${runId} and deleted_at is null`.pipe(
            Effect.map((rows) => rows[0]?.n ?? 0),
            Effect.orDie,
          )
          const listCount = yield* sql<{ n: number }>`
            select count(*)::int as n from lists
            where owner_id = ${ownerId} and import_run_id = ${runId}`.pipe(
            Effect.map((rows) => rows[0]?.n ?? 0),
            Effect.orDie,
          )
          const editedPlaces = yield* sql<{ id: string; name: string }>`
            select id, name from places
            where owner_id = ${ownerId} and import_run_id = ${runId} and deleted_at is null
              and cardinality(manual_fields) > 0
            order by name`.pipe(Effect.orDie)
          return { placeCount, listCount, editedPlaces }
        })

      const matchEntry = (entry: EntryRow) =>
        Effect.gen(function* () {
          const name = entry.name?.trim()
          const near =
            entry.lat !== null && entry.lng !== null ? { lat: entry.lat, lng: entry.lng } : null
          const query = name || entry.address || "place"
          const hits = yield* google.searchText(query, near).pipe(
            Effect.catchTag("GoogleKeyMissing", () => Effect.succeed([])),
            Effect.catchTag("GooglePlacesFailed", () => Effect.succeed([])),
          )
          const hit = hits[0]
          if (!hit) return { status: "needs_review" as const, details: null }

          const nameOverlap =
            Boolean(name) &&
            (hit.name.toLowerCase().includes(name!.toLowerCase()) ||
              name!.toLowerCase().includes(hit.name.toLowerCase().slice(0, 8)))
          if (!nameOverlap && !entry.feature_id && !entry.cid) {
            return { status: "needs_review" as const, details: null }
          }
          const details = yield* google.details(hit.googlePlaceId, null).pipe(
            Effect.catchTag("GoogleKeyMissing", () => Effect.succeed(null)),
            Effect.catchTag("GooglePlacesFailed", () => Effect.succeed(null)),
          )
          if (!details) return { status: "needs_review" as const, details: null }
          return { status: "matched" as const, details }
        })

      const executeCommit = (runId: string) =>
        Effect.gen(function* () {
          const run = yield* loadRunById(runId)
          if (run.status !== "committing") return
          const ownerId = run.owner_id
          const kept = yield* sql<EntryRow>`
            select ${entrySelect}
            from import_entries e
            where e.run_id = ${runId} and e.decision = 'keep' and e.place_id is null
            order by e.id`.pipe(Effect.orDie)

          const listCache = new Map<string, string>()

          for (const entry of kept) {
            if (entry.lat === null || entry.lng === null) {
              yield* sql`
                update import_entries set match_status = 'needs_review'
                where id = ${entry.id}`.pipe(Effect.orDie)
              continue
            }

            const matched = yield* matchEntry(entry)
            let placeId: string

            if (matched.status === "matched" && matched.details) {
              const existing = yield* places.findByGooglePlaceId(
                ownerId,
                matched.details.googlePlaceId,
              )
              if (Option.isSome(existing)) {
                placeId = existing.value.id
              } else {
                const saved = yield* places.addFromGoogle(ownerId, matched.details, "takeout", {
                  importRunId: runId,
                })
                placeId = saved.place.id
                if (saved.created) {
                  yield* enrichment
                    .applyDetails(ownerId, placeId, matched.details)
                    .pipe(Effect.orDie)
                  yield* jobs.enqueueEnrichPlace({ placeId, ownerId })
                }
              }
              yield* sql`
                update import_entries set match_status = 'matched', place_id = ${placeId}
                where id = ${entry.id}`.pipe(Effect.orDie)
            } else {
              const saved = yield* places.addFromTakeout(ownerId, {
                name: entry.name ?? "Imported place",
                category: "other",
                location: { lat: entry.lat, lng: entry.lng },
                address: entry.address,
                notes: entry.note,
                importRunId: runId,
              })
              placeId = saved.place.id
              yield* sql`
                update import_entries set match_status = 'needs_review', place_id = ${placeId}
                where id = ${entry.id}`.pipe(Effect.orDie)
            }

            if (entry.source_list) {
              let listId = listCache.get(entry.source_list)
              if (!listId) {
                const list = yield* lists.ensure(ownerId, entry.source_list, {
                  importRunId: runId,
                })
                listId = list.id
                listCache.set(entry.source_list, listId)
              }
              const current = yield* places.get(ownerId, placeId).pipe(Effect.orDie)
              if (!current.listIds.includes(listId)) {
                yield* places
                  .setLists(ownerId, placeId, [...current.listIds, listId])
                  .pipe(Effect.orDie)
              }
            }
          }

          yield* recount(runId)
          yield* sql`
            update import_runs set status = 'done', committed_at = now()
            where id = ${runId}`.pipe(Effect.orDie)
        })

      return {
        start: Effect.fn("Import.start")(function* (ownerId, upload) {
          const files = yield* filesFromUpload(upload)
          const fingerprint = parseTakeoutFiles(files).fingerprint
          const id = uuidv7()
          yield* sql`
            insert into import_runs (id, owner_id, status, source_fingerprint, counts)
            values (
              ${id}, ${ownerId}, 'parsing', ${fingerprint},
              ${JSON.stringify(emptyCounts())}::jsonb
            )`.pipe(Effect.orDie)
          yield* fillStaging(ownerId, id, files).pipe(
            Effect.catchTag("TakeoutParseError", (error) =>
              sql`
                update import_runs set status = 'failed', error_message = ${error.message}
                where id = ${id}`.pipe(
                Effect.orDie,
                Effect.flatMap(() => Effect.fail(error)),
              ),
            ),
          )
          yield* jobs.enqueueImportParse({ runId: id })
          return toRun(yield* loadRun(ownerId, id).pipe(Effect.orDie))
        }),

        listRuns: (ownerId) =>
          sql<RunRow>`
            select id, status, source_fingerprint, counts, error_message,
                   created_at, committed_at, undone_at
            from import_runs where owner_id = ${ownerId}
            order by created_at desc`.pipe(
            Effect.map((rows) => rows.map(toRun)),
            Effect.orDie,
          ),

        getRun: (ownerId, runId) => loadRun(ownerId, runId).pipe(Effect.map(toRun)),

        listEntries: Effect.fn("Import.listEntries")(function* (ownerId, runId, filter) {
          yield* loadRun(ownerId, runId)
          const clauses = [sql`e.run_id = ${runId}`, sql`e.owner_id = ${ownerId}`]
          if (filter?.decision) clauses.push(sql`e.decision = ${filter.decision}`)
          if (filter?.sourceList !== undefined) {
            clauses.push(
              filter.sourceList === null
                ? sql`e.source_list is null`
                : sql`e.source_list = ${filter.sourceList}`,
            )
          }
          if (filter?.text) {
            const q = `%${filter.text}%`
            clauses.push(sql`(e.name ilike ${q} or e.address ilike ${q} or e.note ilike ${q})`)
          }
          if (filter?.needsLocation === true) clauses.push(sql`e.location is null`)
          if (filter?.needsLocation === false) clauses.push(sql`e.location is not null`)
          if (filter?.alreadyInLibrary === true) {
            clauses.push(sql`exists (
              select 1 from places p
              where p.owner_id = e.owner_id and p.deleted_at is null
                and e.name is not null and lower(p.name) = lower(e.name)
            )`)
          }
          const rows = yield* sql<EntryRow>`
            select ${entrySelect}
            from import_entries e
            where ${sql.and(clauses)}
            order by e.source_list nulls first, e.name nulls last, e.id`.pipe(Effect.orDie)
          return rows.map(toEntry)
        }),

        setDecisions: applyDecisions,

        setListDecision: Effect.fn("Import.setListDecision")(
          function* (ownerId, runId, sourceList, decision) {
            const ids = yield* sql<{ id: string }>`
            select id from import_entries
            where run_id = ${runId} and owner_id = ${ownerId} and source_list = ${sourceList}`.pipe(
              Effect.orDie,
            )
            return yield* applyDecisions(
              ownerId,
              runId,
              ids.map((r) => r.id),
              decision,
            )
          },
        ),

        commit: Effect.fn("Import.commit")(function* (ownerId, runId) {
          const run = yield* loadRun(ownerId, runId)
          if (run.status !== "triage") {
            return yield* new ImportInvalidState({
              message: "Only a triage import can be committed.",
            })
          }
          if (run.counts.pending > 0) {
            return yield* new ImportInvalidState({
              message: `Still ${run.counts.pending} pending — keep or skip them first.`,
            })
          }
          yield* sql`
            update import_runs set status = 'committing' where id = ${runId}`.pipe(Effect.orDie)
          yield* jobs.enqueueImportCommit({ runId })
          yield* executeCommit(runId)
          return toRun(yield* loadRun(ownerId, runId))
        }),

        undoPreview: buildUndoPreview,

        undo: Effect.fn("Import.undo")(function* (ownerId, runId, confirmEdited) {
          const preview = yield* buildUndoPreview(ownerId, runId)
          if (preview.editedPlaces.length > 0 && !confirmEdited) {
            return yield* new ImportInvalidState({
              message: `${preview.editedPlaces.length} imported places were edited — confirm to remove them too.`,
            })
          }
          yield* sql`
            update places set deleted_at = now()
            where owner_id = ${ownerId} and import_run_id = ${runId} and deleted_at is null`.pipe(
            Effect.orDie,
          )
          yield* sql`
            delete from lists where owner_id = ${ownerId} and import_run_id = ${runId}`.pipe(
            Effect.orDie,
          )
          yield* sql`
            update import_runs set status = 'undone', undone_at = now() where id = ${runId}`.pipe(
            Effect.orDie,
          )
          return toRun(yield* loadRun(ownerId, runId))
        }),

        runParseJob: (runId) =>
          Effect.gen(function* () {
            const run = yield* loadRunById(runId)
            if (run.status === "parsing") {
              yield* sql`
                update import_runs set status = 'failed',
                  error_message = 'Parse job found the run still parsing (payload missing).'
                where id = ${runId}`.pipe(Effect.orDie)
            }
          }),

        runCommitJob: executeCommit,
      }
    }),
  )
}
