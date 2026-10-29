import {
  type MediaKind,
  type MediaOrigin,
  mediaKinds,
  mediaOrigins,
  placeCategories,
  placeSources,
  placeStatuses,
} from "@placard/domain"
import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

export const userRoles = ["admin", "member"] as const
export type UserRole = (typeof userRoles)[number]

export const distanceUnits = ["km", "mi"] as const
export type DistanceUnit = (typeof distanceUnits)[number]

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role").$type<UserRole>().notNull().default("member"),
    distanceUnit: text("distance_unit").$type<DistanceUnit>().notNull().default("km"),
    ...timestamps,
  },
  (table) => [
    check("users_role_check", sql`${table.role} in ('admin', 'member')`),
    check("users_distance_unit_check", sql`${table.distanceUnit} in ('km', 'mi')`),
  ],
)

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
)

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
)

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
)

export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    role: text("role").$type<UserRole>().notNull().default("member"),
    invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check("invitations_role_check", sql`${table.role} in ('admin', 'member')`),
    index("invitations_email_idx").on(sql`lower(${table.email})`),
  ],
)

export const instanceSettings = pgTable(
  "instance_settings",
  {
    id: integer("id").primaryKey().default(1),
    googleApiKey: text("google_api_key"),
    signupOpen: boolean("signup_open").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [check("instance_settings_single_row", sql`${table.id} = 1`)],
)

/** WGS84 point; read and written with PostGIS functions in SQL, never as raw values. */
const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType: () => "geography(Point, 4326)",
})

const inList = (values: ReadonlyArray<string>) =>
  sql.raw(`(${values.map((value) => `'${value}'`).join(", ")})`)

export const places = pgTable(
  "places",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    visibility: text("visibility").notNull().default("private"),
    name: text("name").notNull(),
    category: text("category").notNull().default("other"),
    location: geographyPoint("location"),
    address: text("address"),
    googlePlaceId: text("google_place_id"),
    status: text("status"),
    notes: text("notes"),
    utcOffsetMinutes: integer("utc_offset_minutes"),
    source: text("source").notNull(),
    importRunId: text("import_run_id"),
    manualFields: text("manual_fields").array().notNull().default(sql`'{}'::text[]`),
    /** Active library cover; FK added in SQL (media ↔ places cycle). */
    coverMediaId: text("cover_media_id"),
    lastEnrichedAt: timestamp("last_enriched_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check("places_visibility_check", sql`${table.visibility} in ('private')`),
    check("places_category_check", sql`${table.category} in ${inList(placeCategories)}`),
    check("places_source_check", sql`${table.source} in ${inList(placeSources)}`),
    check("places_status_check", sql`${table.status} in ${inList(placeStatuses)}`),
    index("places_location_idx").using("gist", table.location),
    index("places_name_trgm_idx").using("gin", sql`${table.name} gin_trgm_ops`),
    index("places_notes_trgm_idx").using("gin", sql`${table.notes} gin_trgm_ops`),
    index("places_owner_deleted_idx").on(table.ownerId, table.deletedAt),
    index("places_deleted_at_idx").on(table.deletedAt).where(sql`${table.deletedAt} is not null`),
    index("places_import_run_id_idx").on(table.importRunId),
    index("places_cover_media_id_idx").on(table.coverMediaId),
    uniqueIndex("places_owner_google_place_id_idx")
      .on(table.ownerId, table.googlePlaceId)
      .where(sql`${table.googlePlaceId} is not null and ${table.deletedAt} is null`),
  ],
)

export const tags = pgTable(
  "tags",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("tags_owner_name_idx").on(table.ownerId, sql`lower(${table.name})`)],
)

export const placeTags = pgTable(
  "place_tags",
  {
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.placeId, table.tagId] }),
    index("place_tags_tag_id_idx").on(table.tagId),
  ],
)

export const lists = pgTable(
  "lists",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    visibility: text("visibility").notNull().default("private"),
    name: text("name").notNull(),
    description: text("description"),
    importRunId: text("import_run_id"),
    ...timestamps,
  },
  (table) => [
    check("lists_visibility_check", sql`${table.visibility} in ('private')`),
    uniqueIndex("lists_owner_name_idx").on(table.ownerId, sql`lower(${table.name})`),
    index("lists_import_run_id_idx").on(table.importRunId),
  ],
)

export const listItems = pgTable(
  "list_items",
  {
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    position: integer("position"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.placeId] }),
    index("list_items_place_id_idx").on(table.placeId),
  ],
)

export const placeFacts = pgTable(
  "place_facts",
  {
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    source: text("source").notNull(),
    isOverride: boolean("is_override").notNull().default(false),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.placeId, table.key, table.source] }),
    check("place_facts_source_check", sql`${table.source} in ('google', 'manual', 'takeout')`),
    index("place_facts_place_id_idx").on(table.placeId),
  ],
)

export const enrichmentRuns = pgTable(
  "enrichment_runs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("running"),
    total: integer("total").notNull().default(0),
    completed: integer("completed").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    check("enrichment_runs_status_check", sql`${table.status} in ('running', 'done', 'failed')`),
    index("enrichment_runs_owner_created_idx").on(table.ownerId, table.createdAt),
  ],
)

export const importRunStatuses = [
  "parsing",
  "triage",
  "committing",
  "done",
  "undone",
  "failed",
] as const
export type ImportRunStatus = (typeof importRunStatuses)[number]

export const importDecisions = ["pending", "keep", "skip"] as const
export type ImportDecision = (typeof importDecisions)[number]

export const importMatchStatuses = ["unmatched", "matched", "needs_review", "failed"] as const
export type ImportMatchStatus = (typeof importMatchStatuses)[number]

export const importRuns = pgTable(
  "import_runs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").$type<ImportRunStatus>().notNull().default("parsing"),
    sourceFingerprint: text("source_fingerprint").notNull(),
    counts: jsonb("counts")
      .$type<{
        parsed: number
        kept: number
        skipped: number
        matched: number
        needsReview: number
        pending: number
      }>()
      .notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "import_runs_status_check",
      sql`${table.status} in ('parsing', 'triage', 'committing', 'done', 'undone', 'failed')`,
    ),
    index("import_runs_owner_created_idx").on(table.ownerId, table.createdAt),
    index("import_runs_owner_fingerprint_idx").on(table.ownerId, table.sourceFingerprint),
  ],
)

export const importEntries = pgTable(
  "import_entries",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => importRuns.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull(),
    sourceFile: text("source_file").notNull(),
    sourceList: text("source_list"),
    name: text("name"),
    address: text("address"),
    countryCode: text("country_code"),
    note: text("note"),
    location: geographyPoint("location"),
    googleMapsUrl: text("google_maps_url"),
    cid: text("cid"),
    featureId: text("feature_id"),
    savedAt: timestamp("saved_at", { withTimezone: true }),
    decision: text("decision").$type<ImportDecision>().notNull().default("pending"),
    matchStatus: text("match_status").$type<ImportMatchStatus>().notNull().default("unmatched"),
    placeId: text("place_id").references(() => places.id, { onDelete: "set null" }),
  },
  (table) => [
    check("import_entries_decision_check", sql`${table.decision} in ('pending', 'keep', 'skip')`),
    check(
      "import_entries_match_status_check",
      sql`${table.matchStatus} in ('unmatched', 'matched', 'needs_review', 'failed')`,
    ),
    index("import_entries_run_id_idx").on(table.runId),
    index("import_entries_owner_dedupe_idx").on(table.ownerId, table.dedupeKey),
    uniqueIndex("import_entries_run_dedupe_idx").on(table.runId, table.dedupeKey, table.sourceFile),
  ],
)

/** Remembered skip decisions across re-imports of the same Takeout entry. */
export const importSkips = pgTable(
  "import_skips",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull(),
    skippedAt: timestamp("skipped_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.dedupeKey] })],
)

/**
 * Instance-installed plugins (trusted marketplace).
 * Core owns this table; plugin tables stay module-owned.
 */
export const instanceModules = pgTable("instance_modules", {
  moduleId: text("module_id").primaryKey(),
  version: text("version").notNull(),
  source: text("source").$type<"bundled" | "npm" | "folder" | "upload">().notNull(),
  packageName: text("package_name"),
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  loadError: text("load_error"),
  installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
})

/** Per-user visibility / prefs for installed modules. */
export const userModulePrefs = pgTable(
  "user_module_prefs",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    moduleId: text("module_id").notNull(),
    visible: boolean("visible").notNull().default(true),
    prefs: jsonb("prefs").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [primaryKey({ columns: [table.userId, table.moduleId] })],
)

/**
 * restaurants.decide module-owned pick history (avoid-recent).
 * Core services must not read this table.
 */
export const decidePicks = pgTable(
  "decide_picks",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    pickedAt: timestamp("picked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("decide_picks_owner_picked_at_idx").on(table.ownerId, table.pickedAt)],
)

/** Personal access tokens for MCP (Phase 9). Secret is hashed; plaintext shown once. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("api_tokens_owner_id_idx").on(table.ownerId)],
)

/** MCP tool call audit log. */
export const mcpAudit = pgTable(
  "mcp_audit",
  {
    id: text("id").primaryKey(),
    tokenId: text("token_id")
      .notNull()
      .references(() => apiTokens.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tool: text("tool").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    ok: boolean("ok").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("mcp_audit_owner_created_at_idx").on(table.ownerId, table.createdAt),
    index("mcp_audit_token_id_idx").on(table.tokenId),
  ],
)

/** Dish photos, general photos, attachments; Google covers use origin = google. */
export const media = pgTable(
  "media",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    kind: text("kind").$type<MediaKind>().notNull(),
    origin: text("origin").$type<MediaOrigin>().notNull().default("user"),
    path: text("path").notNull(),
    thumbPath: text("thumb_path"),
    mimeType: text("mime_type").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    caption: text("caption"),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("media_kind_check", sql`${table.kind} in ${inList(mediaKinds)}`),
    check("media_origin_check", sql`${table.origin} in ${inList(mediaOrigins)}`),
    index("media_place_id_idx").on(table.placeId),
    index("media_owner_place_idx").on(table.ownerId, table.placeId),
    uniqueIndex("media_place_google_origin_idx")
      .on(table.placeId)
      .where(sql`${table.origin} = 'google'`),
  ],
)
