# Connect agents with MCP

Placard exposes a [Model Context Protocol](https://modelcontextprotocol.io/) endpoint on your instance so tools like Cursor or Claude can search your library, add places, and run module tools (for example **Decide**) using a personal access token you control.

## What you get

| Capability | Notes |
| --- | --- |
| Core tools | Search, get/create places, lists, want/been status |
| Module tools | Optional tools from installed modules (e.g. Decide) |
| Auth | Bearer PAT (`plc_…`) — same privacy rules as the UI |
| Transport | Streamable HTTP at `$PUBLIC_URL/mcp` |

Anyone with a token can read and change your places. Treat it like a password.

## Connect a client

1. Open Placard → **Settings → MCP**.
2. Create a personal access token and copy it once.
3. Note your MCP URL: `https://your-domain/mcp` (same origin as the app).
4. Add that URL + Bearer token in your MCP host (Cursor, Claude Desktop, …).

Example Cursor-style config shape (adjust to your client’s schema):

```json
{
  "mcpServers": {
    "placard": {
      "url": "https://placard.example.com/mcp",
      "headers": {
        "Authorization": "Bearer plc_your_token_here"
      }
    }
  }
}
```

Disable MCP for the whole instance with `MCP_ENABLED=false` in the server environment.

## Core tools

Agents call these names directly (no module prefix):

| Tool | Purpose |
| --- | --- |
| `search_places` | Text / tag / list / type / open now or tonight / radius |
| `get_place` | Card-level detail and key facts |
| `create_place` | Save from a Google Place ID or coordinates |
| `list_lists` | List your lists |
| `add_to_list` | Add a place to a list |
| `set_status` | Want to go / been there |

## Module tools

Installed modules may register extra tools. Placard prefixes them so names never collide:

`{module_id_with_dots_as_underscores}__{local_tool_name}`

Examples after you install those modules:

| Module | Local name | Name agents call |
| --- | --- | --- |
| Decide (`restaurants.decide`) | `decide_restaurant` | `restaurants_decide__decide_restaurant` |
| Pick (`places.pick`, upload example) | `pick_place` | `places_pick__pick_place` |

**Decide** ships with Placard as a Marketplace module (restaurant wheel). It is not a copy of another package you paste into MCP — the host loads the module and exposes its tools when:

1. The module is installed and enabled for the instance
2. You allow MCP for that module under **Settings → Marketplace → [module] → Settings**

Settings lists the **global** tool names (what agents should call).

## Safety

- Prefer short-lived tokens; revoke unused ones in Settings → MCP
- Destructive core actions (delete) are not exposed as MCP tools today
- Turn off **Allow MCP for this module** to hide that module’s tools without uninstalling

## Related

- [Install](install.md) — Compose / Coolify / Dokploy
- [Creating modules](creating-modules.md) — ship your own tools
- [FOR AI — module brief](module-brief-for-ai.md) — copy-paste prompt for agents that write modules
