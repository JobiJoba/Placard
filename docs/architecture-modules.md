# How modules work

Placard is a **core place library** plus optional **modules** for specialized workflows (Decide, custom tools, …). Modules do not fork the core.

## Layers

```
Modules (Decide, your uploads, …)
        ↓  hostFetch + /api/m/<id>
Core HTTP API + MCP transport
        ↓
Places, lists, tags, media, auth
```

| Layer | Owns |
| --- | --- |
| **Core** | Accounts, library, search, enrichment, MCP transport + core tools, shell UI |
| **Modules** | Specialized pages, `/api/m/<id>/*` HTTP, optional MCP tools |

## Install modes

| Mode | Who | How |
| --- | --- | --- |
| **Bundled** | First-party (e.g. Decide) | Shipped inside the Placard image / Marketplace “Preinstalled” |
| **Upload** | You / third parties | Prebuilt zip → Settings → Module marketplace |

There is no “paste a package into MCP.” MCP discovers tools from **loaded modules** after install and user MCP prefs. See [mcp.md](mcp.md).

## Rules that keep the product stable

1. Modules call host APIs (`hostFetch`) — they do not open core SQL.
2. Module-private data lives under the module root on the `modules` volume.
3. One implementation behind HTTP and MCP whenever both exist.
4. Admins can disable or uninstall a module without wiping the place library.
5. Users can hide a module from nav and turn off its MCP tools independently.

## Authoring

- Skeleton zip starter: [`packages/modules/skeleton/`](../packages/modules/skeleton/)
- Humans: [creating-modules.md](creating-modules.md)
- Agents: [module-brief-for-ai.md](module-brief-for-ai.md)
