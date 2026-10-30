import type { DistanceUnit, HouseholdMember, Me, UserSummary } from "@placard/domain"
import { Context, DateTime, Effect, Layer, Option } from "effect"
import { SqlClient } from "effect/sql"
import type { UserRole } from "../db/schema.ts"

interface UserRow {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: UserRole
  readonly distance_unit: DistanceUnit
  readonly created_at: Date
}

/** Session/user row without instance flags (those are attached by Auth / Me API). */
export type MeBase = Omit<Me, "householdEnabled">

const toMeBase = (row: UserRow): MeBase => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  distanceUnit: row.distance_unit,
})

const toSummary = (row: UserRow): UserSummary => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  createdAt: DateTime.fromDateUnsafe(row.created_at),
})

export class Users extends Context.Service<
  Users,
  {
    readonly get: (id: string) => Effect.Effect<Option.Option<MeBase>>
    readonly list: Effect.Effect<ReadonlyArray<UserSummary>>
    readonly householdMembers: Effect.Effect<ReadonlyArray<HouseholdMember>>
    readonly emailExists: (email: string) => Effect.Effect<boolean>
    readonly setDistanceUnit: (id: string, unit: DistanceUnit) => Effect.Effect<MeBase>
  }
>()("placard/Users") {
  static readonly layer = Layer.effect(
    Users,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const columns = sql`id, name, email, role, distance_unit, created_at`

      return {
        get: (id) =>
          sql<UserRow>`select ${columns} from users where id = ${id}`.pipe(
            Effect.map((rows) => Option.fromNullishOr(rows[0]).pipe(Option.map(toMeBase))),
            Effect.orDie,
          ),
        list: sql<UserRow>`select ${columns} from users order by created_at`.pipe(
          Effect.map((rows) => rows.map(toSummary)),
          Effect.orDie,
        ),
        householdMembers: sql<{ id: string; name: string }>`
          select id, name from users order by lower(name), created_at`.pipe(
          Effect.map((rows) => rows.map((row) => ({ id: row.id, name: row.name }))),
          Effect.orDie,
        ),
        emailExists: (email) =>
          sql`select 1 from users where lower(email) = lower(${email})`.pipe(
            Effect.map((rows) => rows.length > 0),
            Effect.orDie,
          ),
        setDistanceUnit: (id, unit) =>
          sql<UserRow>`
            update users set distance_unit = ${unit}, updated_at = now()
            where id = ${id} returning ${columns}`.pipe(
            Effect.flatMap((rows) =>
              rows[0] ? Effect.succeed(toMeBase(rows[0])) : Effect.die(`user ${id} not found`),
            ),
            Effect.orDie,
          ),
      }
    }),
  )
}
