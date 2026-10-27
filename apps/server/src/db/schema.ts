import { placeCategories, placeSources, placeStatuses } from "@placard/domain"
import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  customType,
  index,
  integer,
  pgTable,
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
    index("places_owner_deleted_idx").on(table.ownerId, table.deletedAt),
    uniqueIndex("places_owner_google_place_id_idx")
      .on(table.ownerId, table.googlePlaceId)
      .where(sql`${table.googlePlaceId} is not null and ${table.deletedAt} is null`),
  ],
)
