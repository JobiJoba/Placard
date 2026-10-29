import { Decide } from "@placard/module-restaurants-decide/server"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { SqlClient } from "effect/sql"
import { AppConfig } from "../config.ts"
import { handleMcpRequest } from "../mcp/server.ts"
import { Lists } from "../places/lists.ts"
import { Places } from "../places/places.ts"
import { Search } from "../places/search.ts"
import { Tokens } from "../tokens/tokens.ts"

/** Mounts Streamable HTTP MCP at `/mcp` (stateless, bearer PAT). */
export const McpRoutesLive = HttpRouter.use(
  Effect.fn(function* (router) {
    const config = yield* AppConfig
    const tokens = yield* Tokens
    const places = yield* Places
    const search = yield* Search
    const lists = yield* Lists
    const decide = yield* Decide
    const sql = yield* SqlClient.SqlClient

    const deps = {
      mcpEnabled: config.mcpEnabled,
      tokens,
      places,
      search,
      lists,
      decide,
      sql,
    }

    const handle = (request: HttpServerRequest.HttpServerRequest) =>
      HttpServerRequest.toWeb(request).pipe(
        Effect.flatMap((web) => Effect.promise(() => handleMcpRequest(deps, web))),
        Effect.map(HttpServerResponse.fromWeb),
        Effect.orDie,
      )

    yield* router.add("GET", "/mcp", handle)
    yield* router.add("POST", "/mcp", handle)
    yield* router.add("DELETE", "/mcp", handle)
    yield* router.add("OPTIONS", "/mcp", handle)
  }),
)
