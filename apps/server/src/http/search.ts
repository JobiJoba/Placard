import { Api, CurrentUser } from "@placard/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Search } from "../places/search.ts"

export const SearchApiLive = HttpApiBuilder.group(
  Api,
  "search",
  Effect.fn(function* (handlers) {
    const search = yield* Search
    return handlers.handle("query", ({ payload }) =>
      Effect.gen(function* () {
        const me = yield* CurrentUser
        return yield* search.query(me.id, payload)
      }),
    )
  }),
)
