import { Schema } from "effect"

/**
 * Declared MCP tool metadata (manifest + Settings UI).
 * Handlers live on `createModule().mcpTools`; keep names in sync.
 *
 * `name` is **local to the module** (e.g. `pick_place`). The host registers the
 * global MCP name via {@link moduleMcpToolName} so authors need not coordinate.
 */
export const ModuleMcpToolDef = Schema.Struct({
  name: Schema.String.pipe(Schema.check(Schema.isBetweenLength(1, 64))),
  title: Schema.optional(Schema.String),
  description: Schema.String,
  /**
   * JSON Schema object for tool arguments (MCP inputSchema).
   * Prefer plain objects authors can write in placard.module.json.
   */
  inputSchema: Schema.Record(Schema.String, Schema.Unknown),
})
export type ModuleMcpToolDef = typeof ModuleMcpToolDef.Type

/**
 * Global MCP tool name for a module-owned tool.
 * Example: `restaurants.decide` + `decide_restaurant` → `restaurants_decide__decide_restaurant`
 */
export const moduleMcpToolName = (moduleId: string, localName: string): string => {
  const prefix = moduleId.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  return `${prefix}__${localName}`
}

/** Result shape returned by module MCP handlers (host wraps into MCP content). */
export type ModuleMcpResult =
  | { readonly ok: true; readonly data: unknown }
  | { readonly ok: false; readonly error: string }

export type ModuleHostFetch = (
  path: string,
  init?: globalThis.RequestInit,
) => Promise<globalThis.Response>

/**
 * Context passed to module MCP handlers.
 * `hostFetch` should forward auth the same way plugin HTTP helpers do (cookie or bearer).
 */
export type ModuleMcpContext = {
  readonly moduleId: string
  readonly rootDir: string
  readonly ownerId: string
  readonly hostFetch: ModuleHostFetch
}

export type ModuleMcpTool = {
  readonly def: ModuleMcpToolDef
  readonly handler: (
    args: Record<string, unknown>,
    ctx: ModuleMcpContext,
  ) => Promise<ModuleMcpResult>
}

export type ModuleHttpContext = {
  readonly moduleId: string
  readonly pathSuffix: string
  readonly rootDir: string
  readonly ownerId: string
  readonly hostFetch?: ModuleHostFetch
}

/** What `createModule()` may return (HTTP app and/or MCP tools). */
export type CreateModuleResult = {
  readonly createHttpApp?: (
    request: globalThis.Request,
    ctx: ModuleHttpContext,
  ) => Promise<globalThis.Response> | globalThis.Response
  readonly mcpTools?: ReadonlyArray<ModuleMcpTool>
}
