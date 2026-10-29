import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type {
  DecideRequest,
  ManualPlaceInput,
  Me,
  PlaceStatus,
  SearchFilter,
} from "@placard/domain"
import { RESTAURANTS_DECIDE_ID } from "@placard/module-restaurants-decide/manifest"
import type { Decide } from "@placard/module-restaurants-decide/server"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { z } from "zod"
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

type ToolContext = {
  readonly user: Me
  readonly tokenId: string
  readonly tokens: Tokens["Service"]
  readonly places: Places["Service"]
  readonly search: Search["Service"]
  readonly lists: Lists["Service"]
  readonly decide: Decide["Service"]
  readonly sql: SqlClient.SqlClient
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

const requireDecide = (ctx: ToolContext) =>
  Effect.gen(function* () {
    const rows = yield* ctx.sql<{ enabled: boolean; visible: boolean | null }>`
      select i.enabled, p.visible
      from instance_modules i
      left join user_module_prefs p
        on p.module_id = i.module_id and p.user_id = ${ctx.user.id}
      where i.module_id = ${RESTAURANTS_DECIDE_ID}`.pipe(Effect.orDie)
    const row = rows[0]
    if (!(row?.enabled && (row.visible ?? true))) {
      return yield* Effect.fail(new Error("Decide is not enabled for you on this instance."))
    }
  })

/** Register core + Decide MCP tools on a per-request server. */
export const registerPlacardTools = (server: McpServer, ctx: ToolContext) => {
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

  // Module tool (restaurants.decide) — registered here; third-party modules can plug in later.
  server.registerTool(
    "decide_restaurant",
    {
      title: "Decide restaurant",
      description:
        "Pick one restaurant from your library (open tonight, list/tag/radius, optional avoid-recent). Same rules as the Decide wheel.",
      inputSchema: {
        ...searchFilterShape,
        avoidRecent: z.boolean().default(false),
      },
    },
    async (args) => {
      try {
        const request: DecideRequest = {
          ...toSearchFilter(args),
          avoidRecent: args.avoidRecent ?? false,
        }
        const result = await withAudit(
          ctx,
          "decide_restaurant",
          args as Record<string, unknown>,
          () =>
            ctx.run(
              Effect.gen(function* () {
                yield* requireDecide(ctx)
                return yield* ctx.decide.spin(ctx.user.id, request)
              }),
            ),
        )
        return textResult({
          id: result.place.id,
          name: result.place.name,
          address: result.place.address,
          category: result.place.category,
        })
      } catch (cause) {
        return errorResult(cause instanceof Error ? cause.message : String(cause))
      }
    },
  )
}
