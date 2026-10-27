import { createHash, randomBytes } from "node:crypto"
import {
  EmailAlreadyRegistered,
  type Invite,
  type InviteLookup,
  InviteNotFound,
  type InviteStatus,
} from "@placard/domain"
import { Context, DateTime, Duration, Effect, Layer, Option } from "effect"
import { SqlClient } from "effect/sql"
import { v7 as uuidv7 } from "uuid"
import type { UserRole } from "../db/schema.ts"
import { Users } from "./users.ts"

export const INVITE_TTL = Duration.days(7)

interface InviteRow {
  readonly id: string
  readonly email: string
  readonly status: InviteStatus
  readonly expires_at: Date
  readonly created_at: Date
}

const toInvite = (row: InviteRow): Invite => ({
  id: row.id,
  email: row.email,
  status: row.status,
  expiresAt: DateTime.fromDateUnsafe(row.expires_at),
  createdAt: DateTime.fromDateUnsafe(row.created_at),
})

export const hashInviteToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex")

export class Invites extends Context.Service<
  Invites,
  {
    readonly create: (
      email: string,
      invitedBy: string,
    ) => Effect.Effect<{ readonly invite: Invite; readonly token: string }, EmailAlreadyRegistered>
    readonly list: Effect.Effect<ReadonlyArray<Invite>>
    readonly revoke: (id: string) => Effect.Effect<void, InviteNotFound>
    readonly lookup: (token: string) => Effect.Effect<InviteLookup, InviteNotFound>
    /** Atomically marks a pending invite for `email` as accepted and returns its role. */
    readonly consume: (token: string, email: string) => Effect.Effect<Option.Option<UserRole>>
  }
>()("placard/Invites") {
  static readonly layer = Layer.effect(
    Invites,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const users = yield* Users
      const columns = sql`
        id, email, expires_at, created_at,
        case
          when accepted_at is not null then 'accepted'
          when revoked_at is not null then 'revoked'
          when expires_at <= now() then 'expired'
          else 'pending'
        end as status`
      const ttl = `${Duration.toSeconds(INVITE_TTL)} seconds`

      return {
        create: Effect.fn("Invites.create")(function* (rawEmail, invitedBy) {
          const email = rawEmail.trim().toLowerCase()
          if (yield* users.emailExists(email)) {
            return yield* new EmailAlreadyRegistered({ email })
          }
          const token = randomBytes(32).toString("base64url")
          const rows = yield* sql
            .withTransaction(
              Effect.gen(function* () {
                yield* sql`
                  update invitations set revoked_at = now(), updated_at = now()
                  where lower(email) = ${email} and accepted_at is null and revoked_at is null`
                return yield* sql<InviteRow>`
                  insert into invitations (id, email, token_hash, invited_by, expires_at)
                  values (
                    ${uuidv7()}, ${email}, ${hashInviteToken(token)}, ${invitedBy},
                    now() + ${ttl}::interval
                  )
                  returning ${columns}`
              }),
            )
            .pipe(Effect.orDie)
          return { invite: toInvite(rows[0] as InviteRow), token }
        }),

        list: sql<InviteRow>`select ${columns} from invitations order by created_at desc`.pipe(
          Effect.map((rows) => rows.map(toInvite)),
          Effect.orDie,
        ),

        revoke: (id) =>
          sql`
            update invitations set revoked_at = now(), updated_at = now()
            where id = ${id} and accepted_at is null and revoked_at is null
            returning id`.pipe(
            Effect.orDie,
            Effect.flatMap((rows) => (rows.length > 0 ? Effect.void : new InviteNotFound())),
          ),

        lookup: (token) =>
          sql<{ email: string }>`
            select email from invitations
            where token_hash = ${hashInviteToken(token)}
              and accepted_at is null and revoked_at is null and expires_at > now()`.pipe(
            Effect.orDie,
            Effect.flatMap((rows) =>
              rows[0] ? Effect.succeed({ email: rows[0].email }) : new InviteNotFound(),
            ),
          ),

        consume: (token, email) =>
          sql<{ role: UserRole }>`
            update invitations set accepted_at = now(), updated_at = now()
            where token_hash = ${hashInviteToken(token)}
              and lower(email) = lower(${email})
              and accepted_at is null and revoked_at is null and expires_at > now()
            returning role`.pipe(
            Effect.orDie,
            Effect.map((rows) => Option.fromNullishOr(rows[0]?.role)),
          ),
      }
    }),
  )
}
