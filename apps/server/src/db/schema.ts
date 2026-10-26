import { sql } from "drizzle-orm"
import { boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const userRoles = ["admin", "member"] as const
export type UserRole = (typeof userRoles)[number]

export const distanceUnits = ["km", "mi"] as const
export type DistanceUnit = (typeof distanceUnits)[number]

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("users_role_check", sql`${table.role} in ('admin', 'member')`),
    check("users_distance_unit_check", sql`${table.distanceUnit} in ('km', 'mi')`),
  ],
)
