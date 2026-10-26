import { Layer, ManagedRuntime } from "effect"
import { AppConfig } from "./config.ts"
import { Database, PgLive } from "./db/database.ts"
import { Health } from "./health.ts"

export const CoreLayer = Layer.mergeAll(Health.layer, Database.layer).pipe(
  Layer.provideMerge(PgLive),
)

export const AppLayer = CoreLayer.pipe(Layer.provideMerge(AppConfig.layer))

export const withConfig = (config: AppConfig["Service"]) =>
  CoreLayer.pipe(Layer.provideMerge(Layer.succeed(AppConfig, config)))

export type AppServices = Layer.Success<typeof AppLayer>

export type AppRuntime = ManagedRuntime.ManagedRuntime<AppServices, Layer.Error<typeof AppLayer>>

const globalForRuntime = globalThis as unknown as { placardRuntime: AppRuntime | undefined }

export const getRuntime = (): AppRuntime => {
  globalForRuntime.placardRuntime ??= ManagedRuntime.make(AppLayer)
  return globalForRuntime.placardRuntime
}

export const resetRuntime = async (): Promise<void> => {
  const runtime = globalForRuntime.placardRuntime
  globalForRuntime.placardRuntime = undefined
  await runtime?.dispose()
}
