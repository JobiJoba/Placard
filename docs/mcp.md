# MCP — talking to Placard from agents

Placard should be usable not only from a browser, but from AI clients that speak the **Model Context Protocol (MCP)** — e.g. Cursor, Claude Desktop, and other MCP hosts.

Goal: *“Add this restaurant to my Italian list”* or *“What’s open tonight from my dinner list?”* without opening the UI.

**Product decision: MCP is must-ship** with a usable library — not a backlog nice-to-have. See [decisions.md](decisions.md).

## What we need to deliver

### 1. An MCP server that wraps the core API

Prefer **one HTTP API** (Effect `HttpApi` on `apps/server`) used by:

- the web UI (typed client)
- modules
- the MCP layer

MCP is an adapter on the same server process, not a second business-logic stack.

**Transports (support both over time):**

| Transport | When |
| --- | --- |
| **Streamable HTTP** (e.g. `https://placard.example/mcp`) | Self-hosted instance reachable by a remote/local MCP client — default for Docker/Coolify installs |
| **stdio** (optional package) | Power users running a small local bridge that talks to their Placard URL with a token |

Self-hosted reality: most users want HTTP + API token (or OAuth later), not a public unauthenticated MCP endpoint.

### 2. Auth for MCP

Private data ⇒ MCP must authenticate.

Minimum viable:

- Personal **access token** (or household-scoped token) created in Placard settings
- Token sent by the MCP client (header / MCP auth as specs evolve)
- Same authorization rules as the UI (solo vs household)

Do **not** expose write tools without auth. Reads of private places are also sensitive.

### 3. A curated tool catalog (not every API route)

MCP tools should map to **user goals**, not raw CRUD spam.

**Core tools (shipped)**

| Tool | Purpose |
| --- | --- |
| `search_places` | Find places by text / tag / list / type / open / radius |
| `get_place` | Card-level detail + key facts |
| `create_place` | Save from Place ID or coordinates |
| `list_lists` / `add_to_list` | Organization |
| `set_status` | Want to go / been there |

Open now/tonight is a filter on `search_places` (no separate `list_open_places`). `update_place` is not exposed yet.

**Module tools** (declared by plugins via `createModule().mcpTools`)

| Local name (in module) | MCP name clients call | Status |
| --- | --- | --- |
| `decide_restaurant` | `restaurants_decide__decide_restaurant` | **Shipped** — `restaurants.decide` |
| `pick_place` | `places_pick__pick_place` | Example upload (`places.pick`) |
| dish / vote tools | *(same prefix rule)* | Later |

**Namespacing:** Authors only pick a **local** tool name unique inside their module. The host registers a **global** MCP name `{sanitized_module_id}__{local_name}` (`.` → `_`) so two plugins can both ship `pick_place` without colliding. Core tools stay unprefixed (`search_places`, …). Settings shows the global name (what agents call).

Authors declare tools on the module; the host discovers them from loaded plugins and can disable MCP for a whole module in Settings ([creating-modules.md](creating-modules.md), [architecture-modules.md](architecture-modules.md)).

Also useful MCP **resources** (read-only URIs), e.g. `placard://place/{id}`, `placard://list/{id}` — optional phase-two.

### 4. Docs for users connecting a client

Ship a short “Connect MCP” page:

1. Enable MCP in settings (or it’s on with auth required)
2. Copy base URL + create token
3. Paste into Cursor / Claude / etc. config example
4. Warn: anyone with the token can read/write your places

### 5. Safety defaults

- Confirm or require explicit tool use for destructive actions (delete)
- Rate-limit MCP endpoints
- Audit log of MCP tool calls (who/what/when) — especially for household installs
- Disable MCP entirely via env flag for paranoid deploys

## What we do *not* need on day one

- Submitting Placard as a public ChatGPT plugin directory listing
- Hosting a cloud MCP for all users (each instance is its own server)
- Exposing every internal admin RPC as a tool

## Implementation (shipped)

```
MCP client (Cursor, …)
    │  Streamable HTTP + Bearer PAT (`plc_…`)
    ▼
Placard /mcp  (apps/server; Vite proxies /mcp in Aspire)
    │
    ├─ Core tools (search_places, …)
    └─ Module tools from ModuleRuntime (host-prefixed names)
         │  gated by instance enable + user mcp_enabled
         ▼
    Plugin handlers (hostFetch → /api/search, module data/)
```

`/mcp` lives in-process on `apps/server` (same origin as the SPA in Compose). Settings → MCP creates tokens, lists modules that expose tools (global names), and toggles per-module MCP. Disable globally with `MCP_ENABLED=false`. Optional stdio bridge package remains a later nice-to-have.

Core tools: `search_places`, `get_place`, `create_place`, `add_to_list`, `list_lists`, `set_status`. Module example: `restaurants_decide__decide_restaurant`.

## Success check

A user can, from an MCP-capable chat:

1. Search their library  
2. Add a place to a list  
3. Run **decide restaurant** for “open tonight” on a list  

…against their self-hosted Placard, with a token, without a public share page.
