import { Schema } from "effect"
import { LatLng } from "./places.ts"

export const importRunStatuses = [
  "parsing",
  "triage",
  "committing",
  "done",
  "undone",
  "failed",
] as const
export const ImportRunStatus = Schema.Literals(importRunStatuses)
export type ImportRunStatus = typeof ImportRunStatus.Type

export const importDecisions = ["pending", "keep", "skip"] as const
export const ImportDecision = Schema.Literals(importDecisions)
export type ImportDecision = typeof ImportDecision.Type

export const importMatchStatuses = ["unmatched", "matched", "needs_review", "failed"] as const
export const ImportMatchStatus = Schema.Literals(importMatchStatuses)
export type ImportMatchStatus = typeof ImportMatchStatus.Type

export const ImportCounts = Schema.Struct({
  parsed: Schema.Number,
  kept: Schema.Number,
  skipped: Schema.Number,
  matched: Schema.Number,
  needsReview: Schema.Number,
  pending: Schema.Number,
})
export type ImportCounts = typeof ImportCounts.Type

export const ImportRun = Schema.Struct({
  id: Schema.String,
  status: ImportRunStatus,
  sourceFingerprint: Schema.String,
  counts: ImportCounts,
  expectedApiCalls: Schema.Number,
  createdAt: Schema.DateTimeUtcFromString,
  committedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  undoneAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  errorMessage: Schema.NullOr(Schema.String),
})
export type ImportRun = typeof ImportRun.Type

export const ImportEntry = Schema.Struct({
  id: Schema.String,
  runId: Schema.String,
  dedupeKey: Schema.String,
  sourceFile: Schema.String,
  sourceList: Schema.NullOr(Schema.String),
  name: Schema.NullOr(Schema.String),
  address: Schema.NullOr(Schema.String),
  countryCode: Schema.NullOr(Schema.String),
  note: Schema.NullOr(Schema.String),
  location: Schema.NullOr(LatLng),
  googleMapsUrl: Schema.NullOr(Schema.String),
  cid: Schema.NullOr(Schema.String),
  featureId: Schema.NullOr(Schema.String),
  savedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  decision: ImportDecision,
  matchStatus: ImportMatchStatus,
  placeId: Schema.NullOr(Schema.String),
  alreadyInLibrary: Schema.Boolean,
  crossListDuplicate: Schema.Boolean,
  needsLocation: Schema.Boolean,
})
export type ImportEntry = typeof ImportEntry.Type

export const ImportEntryFilter = Schema.Struct({
  decision: Schema.optional(ImportDecision),
  sourceList: Schema.optional(Schema.NullOr(Schema.String)),
  text: Schema.optional(Schema.Trim.pipe(Schema.check(Schema.isBetweenLength(1, 200)))),
  needsLocation: Schema.optional(Schema.Boolean),
  alreadyInLibrary: Schema.optional(Schema.Boolean),
})
export type ImportEntryFilter = typeof ImportEntryFilter.Type

/** Zip bytes as base64, or already-extracted text files. */
export const ImportUpload = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("zip"),
    filename: Schema.Trim.pipe(Schema.check(Schema.isBetweenLength(1, 260))),
    contentBase64: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  }),
  Schema.Struct({
    kind: Schema.Literal("files"),
    files: Schema.Array(
      Schema.Struct({
        path: Schema.Trim.pipe(Schema.check(Schema.isBetweenLength(1, 500))),
        text: Schema.String,
      }),
    ).pipe(Schema.check(Schema.isMinLength(1))),
  }),
])
export type ImportUpload = typeof ImportUpload.Type

export const ImportDecisionUpdate = Schema.Struct({
  entryIds: Schema.Array(Schema.String).pipe(Schema.check(Schema.isMinLength(1))),
  decision: ImportDecision,
})
export type ImportDecisionUpdate = typeof ImportDecisionUpdate.Type

export const ImportUndoPreview = Schema.Struct({
  placeCount: Schema.Number,
  listCount: Schema.Number,
  editedPlaces: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
    }),
  ),
})
export type ImportUndoPreview = typeof ImportUndoPreview.Type

export class ImportNotFound extends Schema.TaggedError<ImportNotFound>()(
  "ImportNotFound",
  {},
  { httpApiStatus: 404 },
) {}

export class ImportBusy extends Schema.TaggedError<ImportBusy>()(
  "ImportBusy",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

export class ImportInvalidState extends Schema.TaggedError<ImportInvalidState>()(
  "ImportInvalidState",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export class TakeoutParseError extends Schema.TaggedError<TakeoutParseError>()(
  "TakeoutParseError",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}
