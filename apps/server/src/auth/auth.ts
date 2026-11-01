import { DistanceUnit, type Me, UserRole } from "@placard/domain"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError } from "better-auth/api"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect"
import { Pool } from "pg"
import { v7 as uuidv7 } from "uuid"
import { SignupGate } from "../accounts/signup.ts"
import { AppConfig } from "../config.ts"
import { accounts, sessions, users, verifications } from "../db/schema.ts"

export const AUTH_BASE_PATH = "/api/auth"

/** Better Auth session user fields (household flag is attached in AuthenticationLive). */
export type SessionUser = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: Me["role"]
  readonly distanceUnit: Me["distanceUnit"]
}

const SessionUserSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  role: UserRole,
  distanceUnit: DistanceUnit,
})
const decodeSessionUser = Schema.decodeUnknownEffect(SessionUserSchema)

const inviteTokenFrom = (context: { readonly body?: unknown } | null): string | undefined => {
  const body = context?.body
  if (typeof body !== "object" || body === null || !("inviteToken" in body)) return undefined
  return typeof body.inviteToken === "string" && body.inviteToken !== ""
    ? body.inviteToken
    : undefined
}

export class Auth extends Context.Service<
  Auth,
  {
    readonly handler: (request: Request) => Promise<Response>
    readonly currentUser: (headers: Headers) => Effect.Effect<Option.Option<SessionUser>>
  }
>()("placard/Auth") {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* () {
      const config = yield* AppConfig
      const gate = yield* SignupGate

      // Better Auth needs a promise-based driver; it gets its own small pool.
      const pool = yield* Effect.acquireRelease(
        Effect.sync(
          () =>
            new Pool({
              connectionString: Redacted.value(config.databaseUrl),
              application_name: "placard-auth",
              max: 5,
            }),
        ),
        (pool) => Effect.promise(() => pool.end()),
      )

      const db = drizzle({ client: pool })

      const auth = betterAuth({
        appName: "Placard",
        baseURL: config.publicUrl.origin,
        basePath: AUTH_BASE_PATH,
        secret: Redacted.value(config.authSecret),
        trustedOrigins: [config.publicUrl.origin],
        telemetry: { enabled: false },
        database: drizzleAdapter(db, {
          provider: "pg",
          schema: {
            user: users,
            session: sessions,
            account: accounts,
            verification: verifications,
          },
          transaction: true,
        }),
        emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
        user: {
          additionalFields: {
            role: { type: "string", input: false, defaultValue: "member" },
            distanceUnit: { type: "string", input: false, defaultValue: "km" },
          },
        },
        advanced: { database: { generateId: () => uuidv7() } },
        databaseHooks: {
          user: {
            create: {
              before: (user, context) =>
                gate.admit(user.email, inviteTokenFrom(context)).pipe(
                  Effect.map((role) => ({ data: { ...user, role } })),
                  Effect.catchTag("SignupClosed", (error) =>
                    Effect.die(new APIError("FORBIDDEN", { message: error.message })),
                  ),
                  Effect.runPromise,
                ),
            },
          },
          session: {
            create: {
              before: async (session) => {
                const rows = await db
                  .select({ blockedAt: users.blockedAt })
                  .from(users)
                  .where(eq(users.id, session.userId))
                  .limit(1)
                if (rows[0]?.blockedAt) {
                  throw new APIError("FORBIDDEN", {
                    message: "This account has been blocked by the admin.",
                  })
                }
              },
            },
          },
        },
      })

      return {
        handler: auth.handler,
        currentUser: (headers) =>
          Effect.tryPromise(async () => {
            const session = await auth.api.getSession({ headers })
            if (!session) return null
            // Sessions are deleted when a user is blocked; this also covers
            // in-flight requests and keeps every route (avatars, media) honest.
            const rows = await db
              .select({ blockedAt: users.blockedAt })
              .from(users)
              .where(eq(users.id, session.user.id))
              .limit(1)
            return rows[0]?.blockedAt ? null : session
          }).pipe(
            Effect.flatMap((session) =>
              session
                ? decodeSessionUser(session.user).pipe(Effect.map(Option.some))
                : Effect.succeedNone,
            ),
            Effect.orDie,
          ),
      }
    }),
  )
}
