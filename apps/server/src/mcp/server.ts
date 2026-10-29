import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import type { Me } from "@placard/domain"
import type { Decide } from "@placard/module-restaurants-decide/server"
import { Effect, Result } from "effect"
import type { SqlClient } from "effect/sql"
import type { Lists } from "../places/lists.ts"
import type { Places } from "../places/places.ts"
import type { Search } from "../places/search.ts"
import type { Tokens } from "../tokens/tokens.ts"
import { createRateLimiter } from "./rate-limit.ts"
import { registerPlacardTools } from "./tools.ts"

const rateLimiter = createRateLimiter()

export type McpDeps = {
  readonly mcpEnabled: boolean
  readonly tokens: Tokens["Service"]
  readonly places: Places["Service"]
  readonly search: Search["Service"]
  readonly lists: Lists["Service"]
  readonly decide: Decide["Service"]
  readonly sql: SqlClient.SqlClient
}

const bearerSecret = (request: Request): string | null => {
  const header = request.headers.get("authorization")
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]?.trim() || null
}

const corsHeaders = (): Record<string, string> => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, mcp-session-id, Last-Event-ID, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
})

const withCors = (response: Response): Response => {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(corsHeaders())) headers.set(key, value)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const jsonError = (status: number, error: string) => withCors(Response.json({ error }, { status }))

/**
 * Handle one Streamable HTTP MCP request (stateless).
 * Auth: Bearer personal access token. Disabled when MCP_ENABLED=false.
 */
export const handleMcpRequest = (deps: McpDeps, request: Request): Promise<Response> =>
  Effect.runPromise(
    Effect.gen(function* () {
      if (!deps.mcpEnabled) {
        return jsonError(503, "MCP is disabled on this instance (MCP_ENABLED=false).")
      }

      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }))
      }

      const secret = bearerSecret(request)
      if (!secret) {
        return jsonError(401, "Authorization Bearer token required.")
      }

      const authResult = yield* deps.tokens.authenticate(secret).pipe(Effect.result)
      if (Result.isFailure(authResult)) {
        return jsonError(401, authResult.failure.message)
      }
      const auth = authResult.success

      if (!rateLimiter.allow(auth.tokenId)) {
        return jsonError(429, "Rate limit exceeded. Try again shortly.")
      }

      yield* deps.tokens.touch(auth.tokenId)

      const run = <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> =>
        Effect.runPromise(effect)

      const server = new McpServer({ name: "placard", version: "0.1.0" })
      registerPlacardTools(server, {
        user: auth.user satisfies Me,
        tokenId: auth.tokenId,
        tokens: deps.tokens,
        places: deps.places,
        search: deps.search,
        lists: deps.lists,
        decide: deps.decide,
        sql: deps.sql,
        run,
      })

      const transport = new WebStandardStreamableHTTPServerTransport()
      yield* Effect.promise(() => server.connect(transport))
      const response = yield* Effect.promise(() => transport.handleRequest(request))
      return withCors(response)
    }),
  )
