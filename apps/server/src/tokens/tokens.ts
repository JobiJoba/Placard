import { createHash, randomBytes } from "node:crypto"
import {
  type ApiToken,
  type CreatedToken,
  type CreateTokenInput,
  type Me,
  TokenNotFound,
  Unauthorized,
} from "@placard/domain"
import { Clock, Context, DateTime, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { v7 as uuidv7 } from "uuid"

const TOKEN_PREFIX = "plc_"

const hashToken = (secret: string) => createHash("sha256").update(secret).digest("hex")

const mintSecret = () => `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`

interface TokenRow {
  readonly id: string
  readonly owner_id: string
  readonly name: string
  readonly token_hash: string
  readonly last_used_at: Date | null
  readonly revoked_at: Date | null
  readonly created_at: Date
  readonly role: "admin" | "member"
  readonly email: string
  readonly distance_unit: "km" | "mi"
}

const toToken = (row: TokenRow): ApiToken => ({
  id: row.id,
  name: row.name,
  createdAt: DateTime.fromDateUnsafe(row.created_at),
  lastUsedAt: row.last_used_at ? DateTime.fromDateUnsafe(row.last_used_at) : null,
  revokedAt: row.revoked_at ? DateTime.fromDateUnsafe(row.revoked_at) : null,
})

interface AuthRow extends TokenRow {
  readonly user_name: string
}

/** Personal access tokens for MCP bearer auth. */
export class Tokens extends Context.Service<
  Tokens,
  {
    readonly list: (ownerId: string) => Effect.Effect<ReadonlyArray<ApiToken>>
    readonly create: (ownerId: string, input: CreateTokenInput) => Effect.Effect<CreatedToken>
    readonly revoke: (ownerId: string, id: string) => Effect.Effect<void, TokenNotFound>
    /** Resolve a bearer secret to the owning user, or Unauthorized. */
    readonly authenticate: (secret: string) => Effect.Effect<
      {
        readonly user: Me
        readonly tokenId: string
      },
      Unauthorized
    >
    readonly touch: (tokenId: string) => Effect.Effect<void>
    readonly audit: (input: {
      readonly tokenId: string
      readonly ownerId: string
      readonly tool: string
      readonly args: Record<string, unknown>
      readonly ok: boolean
      readonly error?: string
    }) => Effect.Effect<void>
  }
>()("placard/Tokens") {
  static readonly layer = Layer.effect(
    Tokens,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      return Tokens.of({
        list: Effect.fn("Tokens.list")(function* (ownerId) {
          const rows = yield* sql<TokenRow>`
            select t.id, t.owner_id, t.name, t.token_hash, t.last_used_at, t.revoked_at, t.created_at,
                   u.role, u.email, u.distance_unit
            from api_tokens t
            join users u on u.id = t.owner_id
            where t.owner_id = ${ownerId}
            order by t.created_at desc`.pipe(Effect.orDie)
          return rows.map(toToken)
        }),

        create: Effect.fn("Tokens.create")(function* (ownerId, input) {
          const id = uuidv7()
          const secret = mintSecret()
          const tokenHash = hashToken(secret)
          const rows = yield* sql<TokenRow>`
            insert into api_tokens (id, owner_id, name, token_hash)
            values (${id}, ${ownerId}, ${input.name}, ${tokenHash})
            returning id, owner_id, name, token_hash, last_used_at, revoked_at, created_at`.pipe(
            Effect.orDie,
          )
          const row = rows[0]!
          return {
            token: {
              id: row.id,
              name: row.name,
              createdAt: DateTime.fromDateUnsafe(row.created_at),
              lastUsedAt: null,
              revokedAt: null,
            },
            secret,
          }
        }),

        revoke: Effect.fn("Tokens.revoke")(function* (ownerId, id) {
          const now = yield* Clock.currentTimeMillis
          const rows = yield* sql<{ id: string }>`
            update api_tokens
            set revoked_at = coalesce(revoked_at, ${new Date(now)})
            where id = ${id} and owner_id = ${ownerId}
            returning id`.pipe(Effect.orDie)
          if (!rows[0]) {
            return yield* new TokenNotFound({ message: "That token was not found." })
          }
        }),

        authenticate: Effect.fn("Tokens.authenticate")(function* (secret) {
          if (!secret.startsWith(TOKEN_PREFIX)) {
            return yield* new Unauthorized({ message: "Invalid or revoked access token." })
          }
          const tokenHash = hashToken(secret)
          const rows = yield* sql<AuthRow>`
            select t.id, t.owner_id, t.name, t.token_hash, t.last_used_at, t.revoked_at, t.created_at,
                   u.role, u.email, u.distance_unit, u.name as user_name
            from api_tokens t
            join users u on u.id = t.owner_id
            where t.token_hash = ${tokenHash} and t.revoked_at is null`.pipe(Effect.orDie)
          const row = rows[0]
          if (!row) {
            return yield* new Unauthorized({ message: "Invalid or revoked access token." })
          }
          return {
            tokenId: row.id,
            user: {
              id: row.owner_id,
              name: row.user_name,
              email: row.email,
              role: row.role,
              distanceUnit: row.distance_unit,
            },
          }
        }),

        touch: Effect.fn("Tokens.touch")(function* (tokenId) {
          const now = yield* Clock.currentTimeMillis
          yield* sql`
            update api_tokens set last_used_at = ${new Date(now)} where id = ${tokenId}`.pipe(
            Effect.orDie,
          )
        }),

        audit: Effect.fn("Tokens.audit")(function* (input) {
          yield* sql`
            insert into mcp_audit (id, token_id, owner_id, tool, input, ok, error)
            values (
              ${uuidv7()}, ${input.tokenId}, ${input.ownerId}, ${input.tool},
              ${JSON.stringify(redact(input.args))}::jsonb, ${input.ok}, ${input.error ?? null}
            )`.pipe(Effect.orDie)
        }),
      })
    }),
  )
}

const redact = (args: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (/secret|token|password|key/i.test(key)) out[key] = "[redacted]"
    else out[key] = value
  }
  return out
}
