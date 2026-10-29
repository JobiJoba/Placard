# Skeleton module (`example.skeleton`)

Minimal Placard Marketplace starter for **humans** and **AI agents**.

## What it includes

- `GET /api/m/example.skeleton/hello` — JSON hello
- Page at `/m/example.skeleton` — button that calls hello
- MCP tool `skeleton_hello` → global name `example_skeleton__skeleton_hello`
- Host React bridge shims + `build:zip` script (same pattern as `places.pick`)

## Build the upload zip

From the repo root (after `pnpm install`):

```sh
pnpm --filter @placard/module-skeleton build:zip
```

Output: `packages/modules/skeleton/dist/example.skeleton-0.1.0.zip`

## Install on an instance

1. Settings → Module marketplace → **Choose .zip**
2. Enable the module for the instance
3. Module settings → show in nav (and Allow MCP if you want the tool)
4. Open **Skeleton** under More (or `/m/example.skeleton`)

## Customize

1. Change `id` / paths in `placard.module.json` (and matching `API` constant in the page)
2. Replace `create-module.ts` handlers
3. Replace `SkeletonPage.tsx`
4. Rebuild the zip

## Docs

- [creating-modules.md](../../../docs/creating-modules.md)
- [FOR AI — module brief](../../../docs/module-brief-for-ai.md)
