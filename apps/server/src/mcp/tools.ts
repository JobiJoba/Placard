import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ManualPlaceInput, Me, PlaceStatus, SearchFilter } from "@placard/domain"
import { moduleMcpToolName } from "@placard/module-sdk"
import type { Effect } from "effect"
import { z } from "zod"
import type { ModuleRuntime } from "../modules/loader.ts"
import type { Modules } from "../modules/modules.ts"
import type { Lists } from "../places/lists.ts"
import type { Places } from "../places/places.ts"
import type { Search } from "../places/search.ts"
import type { Tokens } from "../tokens/tokens.ts"

const latLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

const searchFilterShape = {
  text: z.string().min(1).max(200).optional(),
  category: z
    .enum(["restaurant", "cafe", "bar", "park", "museum", "cinema", "hotel", "trail", "other"])
    .optional(),
  open: z.enum(["now", "tonight"]).optional(),
  near: latLng.optional(),
  radiusKm: z.number().gt(0).lte(500).optional(),
  tag: z.string().optional(),
  list: z.string().optional(),
  status: z.enum(["want_to_go", "been_there"]).optional(),
}

const toSearchFilter = (args: z.infer<z.ZodObject<typeof searchFilterShape>>): SearchFilter => ({
  ...(args.text !== undefined ? { text: args.text } : {}),
  ...(args.category !== undefined ? { category: args.category } : {}),
  ...(args.open !== undefined ? { open: args.open } : {}),
  ...(args.near !== undefined ? { near: args.near } : {}),
  ...(args.radiusKm !== undefined ? { radiusKm: args.radiusKm } : {}),
  ...(args.tag !== undefined ? { tag: args.tag } : {}),
  ...(args.list !== undefined ? { list: args.list } : {}),
  ...(args.status !== undefined ? { status: args.status } : {}),
})

const textResult = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
})

const errorResult = (message: string) => ({
  isError: true as const,
  content: [{ type: "text" as const, text: message }],
})

export type ToolContext = {
  readonly user: Me
  readonly tokenId: string
  readonly tokenSecret: string
  readonly publicUrl: URL
  readonly tokens: Tokens["Service"]
  readonly places: Places["Service"]
  readonly search: Search["Service"]
  readonly lists: Lists["Service"]
  readonly modules: Modules["Service"]
  readonly runtime: ModuleRuntime["Service"]
  readonly run: <A, E>(effect: Effect.Effect<A, E, never>) => Promise<A>
}

const withAudit = async <A>(
  ctx: ToolContext,
  tool: string,
  args: Record<string, unknown>,
  work: () => Promise<A>,
): Promise<A> => {
  try {
    const result = await work()
    await ctx.run(
      ctx.tokens.audit({
        tokenId: ctx.tokenId,
        ownerId: ctx.user.id,
        tool,
        args,
        ok: true,
      }),
    )
    return result
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    await ctx.run(
      ctx.tokens.audit({
        tokenId: ctx.tokenId,
        ownerId: ctx.user.id,
        tool,
        args,
        ok: false,
        error: message,
      }),
    )
    throw cause
  }
}

/** JSON Schema → loose zod object so MCP SDK accepts plugin schemas. */
const zodFromJsonSchema = (schema: Record<string, unknown>) => {
  const props = (schema.properties ?? {}) as Record<string, unknown>
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [key, raw] of Object.entries(props)) {
    const prop = raw as { type?: string; enum?: unknown[] }
    let field: z.ZodTypeAny = z.unknown()
    if (prop.type === "string" && Array.isArray(prop.enum)) {
      field = z.enum(prop.enum as [string, ...string[]])
    } else if (prop.type === "string") field = z.string()
    else if (prop.type === "number") field = z.number()
    else if (prop.type === "boolean") field = z.boolean()
    else if (prop.type === "object") field = z.record(z.string(), z.unknown())
    shape[key] = field.optional()
  }
  return shape
}

/** Register core MCP tools, then enabled module tools. */
export const registerPlacardTools = async (server: McpServer, ctx: ToolContext) => {
  server.registerTool(
    "search_places",
    {
      title: "Search places",
      description:
        "Search your Placard library with text, type, open now/tonight, radius, tag, list, or status.",
      inputSchema: searchFilterShape,
    },
    async (args) => {
      try {
        const filter = toSearchFilter(args)
        const hits = await withAudit(ctx, "search_places", args as Record<string, unknown>, () =>
          ctx.run(ctx.search.query(ctx.user.id, filter)),
        )
        return textResult({
          count: hits.length,
          hits: hits.map((h) => ({
            id: h.place.id,
            name: h.place.name,
            category: h.place.category,
            address: h.place.address,
            status: h.place.status,
            distanceMeters: h.distanceMeters,
            tags: h.place.tags.map((t) => t.name),
          })),
        })
      } catch (cause) {
        return errorResult(cause instanceof Error ? cause.message : String(cause))
      }
    },
  )

  server.registerTool(
    "get_place",
    {
      title: "Get place",
      description: "Fetch one place card by id, including facts and tags.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      try {
        const place = await withAudit(ctx, "get_place", { id }, () =>
          ctx.run(ctx.places.get(ctx.user.id, id)),
        )
        return textResult(place)
      } catch (cause) {
        return errorResult(cause instanceof Error ? cause.message : String(cause))
      }
    },
  )

  server.registerTool(
    "create_place",
    {
      title: "Create place",
      description:
        "Add a manual place (pin) to your library. Use when you already know name and coordinates.",
      inputSchema: {
        name: z.string().min(1).max(200),
        category: z.enum([
          "restaurant",
          "cafe",
          "bar",
          "park",
          "museum",
          "cinema",
          "hotel",
          "trail",
          "other",
        ]),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        address: z.string().nullable().optional(),
      },
    },
    async (args) => {
      try {
        const input: ManualPlaceInput = {
          name: args.name,
          category: args.category,
          location: { lat: args.lat, lng: args.lng },
          address: args.address ?? null,
        }
        const saved = await withAudit(ctx, "create_place", args as Record<string, unknown>, () =>
          ctx.run(ctx.places.addManual(ctx.user.id, input, { source: "mcp" })),
        )
        return textResult(saved)
      } catch (cause) {
        return errorResult(cause instanceof Error ? cause.message : String(cause))
      }
    },
  )

  server.registerTool(
    "add_to_list",
    {
      title: "Add to list",
      description: "Add a place to one of your lists (by list id).",
      inputSchema: {
        placeId: z.string().min(1),
        listId: z.string().min(1),
      },
    },
    async ({ placeId, listId }) => {
      try {
        const result = await withAudit(ctx, "add_to_list", { placeId, listId }, () =>
          ctx.run(ctx.places.bulk(ctx.user.id, [placeId], { _tag: "addToList", listId })),
        )
        return textResult(result)
      } catch (cause) {
        return errorResult(cause instanceof Error ? cause.message : String(cause))
      }
    },
  )

  server.registerTool(
    "set_status",
    {
      title: "Set status",
      description: "Set want_to_go / been_there on a place, or clear status with null.",
      inputSchema: {
        placeId: z.string().min(1),
        status: z.enum(["want_to_go", "been_there"]).nullable(),
      },
    },
    async ({ placeId, status }) => {
      try {
        const place = await withAudit(ctx, "set_status", { placeId, status }, () =>
          ctx.run(
            ctx.places.update(ctx.user.id, placeId, {
              status: status as PlaceStatus | null,
            }),
          ),
        )
        return textResult({ id: place.id, name: place.name, status: place.status })
      } catch (cause) {
        return errorResult(cause instanceof Error ? cause.message : String(cause))
      }
    },
  )

  server.registerTool(
    "list_lists",
    {
      title: "List lists",
      description: "List your Placard lists (id, name, place count).",
    },
    async () => {
      try {
        const lists = await withAudit(ctx, "list_lists", {}, () =>
          ctx.run(ctx.lists.list(ctx.user.id)),
        )
        return textResult(lists)
      } catch (cause) {
        return errorResult(cause instanceof Error ? cause.message : String(cause))
      }
    },
  )

  const registered = new Set<string>([
    "search_places",
    "get_place",
    "create_place",
    "add_to_list",
    "set_status",
    "list_lists",
  ])

  for (const plugin of ctx.runtime.all()) {
    const tools = plugin.mcpTools
    if (!tools || tools.length === 0) continue

    const mcpOk = await ctx.run(ctx.modules.isMcpEnabledForUser(ctx.user.id, plugin.moduleId))
    if (!mcpOk) continue

    const seenLocal = new Set<string>()
    for (const tool of tools) {
      if (seenLocal.has(tool.def.name)) continue
      seenLocal.add(tool.def.name)

      const globalName = moduleMcpToolName(plugin.moduleId, tool.def.name)
      if (registered.has(globalName)) continue
      registered.add(globalName)

      const inputSchema = zodFromJsonSchema(tool.def.inputSchema as Record<string, unknown>)
      server.registerTool(
        globalName,
        {
          title: tool.def.title ?? tool.def.name,
          description: tool.def.description,
          ...(Object.keys(inputSchema).length > 0 ? { inputSchema } : {}),
        },
        async (args) => {
          try {
            const result = await withAudit(
              ctx,
              globalName,
              args as Record<string, unknown>,
              async () => {
                const hostFetch = async (path: string, init?: RequestInit) => {
                  // In-process search so plugins can hostFetch("/api/search") under MCP without cookies.
                  const pathname = path.startsWith("http")
                    ? new URL(path).pathname
                    : path.split("?")[0]
                  if (
                    pathname === "/api/search" &&
                    (init?.method ?? "GET").toUpperCase() === "POST"
                  ) {
                    const raw =
                      typeof init?.body === "string"
                        ? init.body
                        : init?.body != null
                          ? String(init.body)
                          : "{}"
                    const filter = JSON.parse(raw) as SearchFilter
                    const hits = await ctx.run(ctx.search.query(ctx.user.id, filter))
                    return Response.json(hits)
                  }
                  const url = new URL(path, ctx.publicUrl)
                  const headers = new Headers(init?.headers)
                  headers.set("authorization", `Bearer ${ctx.tokenSecret}`)
                  headers.set("origin", ctx.publicUrl.origin)
                  if (init?.body && !headers.has("content-type")) {
                    headers.set("content-type", "application/json")
                  }
                  return ctx.runtime.hostFetch(url, { ...init, headers })
                }
                return tool.handler(args as Record<string, unknown>, {
                  moduleId: plugin.moduleId,
                  rootDir: plugin.rootDir,
                  ownerId: ctx.user.id,
                  hostFetch,
                })
              },
            )
            if (!result.ok) return errorResult(result.error)
            return textResult(result.data)
          } catch (cause) {
            return errorResult(cause instanceof Error ? cause.message : String(cause))
          }
        },
      )
    }
  }
}
