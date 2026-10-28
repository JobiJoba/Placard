import { ModuleHostSearch } from "@placard/module-sdk"
import { Effect, Layer } from "effect"
import { Search } from "../places/search.ts"

/** Maps core Search onto the module-sdk host contract. */
export const ModuleHostSearchLive = Layer.effect(
  ModuleHostSearch,
  Effect.gen(function* () {
    const search = yield* Search
    return ModuleHostSearch.of({
      query: (ownerId, filter) => search.query(ownerId, filter),
    })
  }),
)
