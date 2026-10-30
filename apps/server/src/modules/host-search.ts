import { ModuleHostSearch } from "@placard/module-sdk"
import { Effect, Layer } from "effect"
import { Search } from "../places/search.ts"
import { InstanceSettings } from "../settings/instance-settings.ts"

/** Maps core Search onto the module-sdk host contract. */
export const ModuleHostSearchLive = Layer.effect(
  ModuleHostSearch,
  Effect.gen(function* () {
    const search = yield* Search
    const settings = yield* InstanceSettings
    return ModuleHostSearch.of({
      query: (ownerId, filter) =>
        Effect.gen(function* () {
          const householdEnabled = yield* settings.householdEnabled
          return yield* search.query(ownerId, householdEnabled, filter)
        }),
    })
  }),
)
