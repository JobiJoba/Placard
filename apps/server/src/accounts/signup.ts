import { Context, Data, Effect, Layer, Option } from "effect"
import { SqlClient } from "effect/sql"
import type { UserRole } from "../db/schema.ts"
import { Invites } from "./invites.ts"

export class SignupClosed extends Data.TaggedError("SignupClosed")<{ readonly message: string }> {}

/**
 * Decides who may create an account: the very first signup becomes admin and
 * closes signup; everyone after that needs a valid invite for their email.
 */
export class SignupGate extends Context.Service<
  SignupGate,
  {
    readonly isOpen: Effect.Effect<boolean>
    readonly admit: (
      email: string,
      inviteToken: string | undefined,
    ) => Effect.Effect<UserRole, SignupClosed>
  }
>()("placard/SignupGate") {
  static readonly layer = Layer.effect(
    SignupGate,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const invites = yield* Invites

      // `not exists users` lets a fresh install recover if the first signup
      // claimed the flag but then failed to insert the user.
      const openCondition = sql`(signup_open or not exists (select 1 from users))`

      const claimBootstrap = sql`
        update instance_settings set signup_open = false, updated_at = now()
        where id = 1 and ${openCondition}
        returning id`.pipe(
        Effect.map((rows) => rows.length > 0),
        Effect.orDie,
      )

      return {
        isOpen: sql<{ open: boolean }>`
          select ${openCondition} as open from instance_settings where id = 1`.pipe(
          Effect.map((rows) => rows[0]?.open ?? false),
          Effect.orDie,
        ),
        admit: Effect.fn("SignupGate.admit")(function* (email, inviteToken) {
          if (yield* claimBootstrap) return "admin" as const
          if (inviteToken) {
            const role = yield* invites.consume(inviteToken, email)
            if (Option.isSome(role)) return role.value
            return yield* new SignupClosed({
              message: "This invite is invalid, expired, or for a different email.",
            })
          }
          return yield* new SignupClosed({
            message: "Signup is invite-only. Ask your Placard admin for an invite.",
          })
        }),
      }
    }),
  )
}
