import { PgClient } from "@effect/sql-pg"
import * as PgDrizzle from "drizzle-orm/effect-postgres"
import { Context, Effect, Layer } from "effect"
import { AppConfig } from "../config.ts"

export const PgLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AppConfig
    return PgClient.layer({ url: config.databaseUrl, applicationName: "placard" })
  }),
)

export type Db = Effect.Success<ReturnType<typeof PgDrizzle.makeWithDefaults>>

export class Database extends Context.Service<Database, Db>()("placard/Database") {
  static readonly layer = Layer.effect(Database, PgDrizzle.makeWithDefaults())
}
