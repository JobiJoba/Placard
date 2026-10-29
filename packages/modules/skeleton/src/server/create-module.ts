import type {
  CreateModuleResult,
  ModuleHttpContext,
  ModuleMcpContext,
  ModuleMcpResult,
} from "@placard/module-sdk"

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } })

const helloPayload = (ownerId: string) => ({
  ok: true as const,
  message: "Hello from example.skeleton",
  ownerId,
  hint: "Replace this handler with your feature. Use ctx.hostFetch for POST /api/search.",
})

const skeletonHelloDef = {
  name: "skeleton_hello",
  title: "Skeleton hello",
  description: "Returns a short hello from the skeleton module (sanity-check MCP wiring).",
  inputSchema: {
    type: "object",
    properties: {},
  },
}

export function createModule(): CreateModuleResult {
  return {
    createHttpApp: async (request: Request, ctx: ModuleHttpContext) => {
      const path = ctx.pathSuffix.replace(/^\/+/, "")
      if (request.method === "GET" && (path === "" || path === "hello")) {
        return json(helloPayload(ctx.ownerId))
      }
      return json({ message: `No route for ${request.method} /${path}` }, 404)
    },
    mcpTools: [
      {
        def: skeletonHelloDef,
        handler: async (
          _args: Record<string, unknown>,
          mcpCtx: ModuleMcpContext,
        ): Promise<ModuleMcpResult> => ({
          ok: true,
          data: helloPayload(mcpCtx.ownerId),
        }),
      },
    ],
  }
}
