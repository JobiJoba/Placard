import { fileURLToPath } from "node:url"
import { NodeRuntime } from "@effect/platform-node"
import { migrate } from "drizzle-orm/effect-postgres/migrator"
import { Effect } from "effect"
import { loadConfigOrExit } from "../config.ts"
import { withConfig } from "../runtime.ts"
import { Database } from "./database.ts"

export const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url)) // apps/server/drizzle

export const runMigrations = Effect.gen(function* () {
  const db = yield* Database
  yield* migrate(db, { migrationsFolder })
  yield* Effect.log("Database migrations applied")
})

if (import.meta.main) {
  const config = Effect.runSync(loadConfigOrExit)
  NodeRuntime.runMain(runMigrations.pipe(Effect.provide(withConfig(config))))
}
