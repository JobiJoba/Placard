import { sql } from "drizzle-orm"
import { boolean, check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"

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
