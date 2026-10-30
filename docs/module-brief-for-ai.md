# FOR AI — module brief

Copy the block below into an agent prompt when you want it to **create or modify a Placard Marketplace module**. It is self-contained on purpose.

Human walkthrough: [creating-modules.md](creating-modules.md).

````text
You are building a Placard Marketplace module for a self-hosted Placard instance.

## Goal
Ship a prebuilt zip the admin uploads under Settings → Module marketplace. There is no in-container TypeScript compile and no npm-install path into Placard.

## Deliverable zip layout
placard.module.json
server/index.js    # ESM; must export function createModule()
web/index.js       # browser ESM; export page component(s) named in the manifest
web/assets/…       # optional icon/cover

## Manifest (placard.module.json)
- id: "family.feature" (example places.pick)
- name, version, description
- permissions: subset of ["places.read", "search.query", "media.read"]
- nav: [{ "path": "/m/<id>", "label": "…", "slot": "primary" | "more" }]
- source: "upload"   # required for Marketplace zips
- sdkVersion: "0.1.0"  # major must match host
- serverEntry: "./server/index.js"
- webEntry: "./web/index.js"
- webRoutes: [{ "path": "/m/<id>", "exportName": "YourPage" }]
- actions (optional): [{ "id": "open", "label": "…", "keywords": "…", "path": "/m/<id>" }]
  CMD+K Actions group; selecting navigates to `path`. Hidden when the user hides the module (same as nav).
- mcpTools (optional): [{ "name": "local_tool_name", "title": "…", "description": "…" }]
  Local names only. Host exposes global MCP name:
  {id with "." → "_"}__{local_name}
  Example: places.pick + pick_place → places_pick__pick_place

## Server contract
export function createModule() {
  return {
    createHttpApp?: (ctx) => …,  // requests under /api/m/<id>/*
    mcpTools?: [{ def: { name, description, … }, handler }]
  }
}
- Use ctx.hostFetch("POST /api/search", { method, headers, body }) for library queries.
- Persist private data under ctx.rootDir (JSON files are fine).
- Do NOT import core SQL, Effect services, or patch host tables.
- HTTP and MCP should share the same business helpers.
- Decide (restaurants.decide) is a shipped first-party module — do not “copy Decide into MCP”; implement your own createModule + optional mcpTools.

## Web contract
- Export the component named by webRoutes[].exportName.
- Bundle for the browser. Do NOT ship React/react-dom/react-router in the zip.
- Alias React / jsx-runtime / react-router Link to globalThis.__PLACARD_PLUGIN__ (host bridge), as in packages/modules/places-pick.
- Call your API at /api/m/<id>/… with credentials included (cookies).

## Build practice that works
- esbuild (or equivalent) fully bundles server for platform node, format esm.
- Fully bundle web for browser; externalize nothing that uploads cannot resolve.
- Zip the pack directory; admin uploads the zip.

## Install / verify on an instance
1. Settings → Module marketplace → Choose .zip
2. Extract path: PLACARD_MODULES_DIR/<id>/ (Compose volume "modules")
3. Enable instance module; user toggles “shown in nav” and “Allow MCP”
4. UI at /m/<id>; HTTP at /api/m/<id>/*; MCP tools listed in Settings → MCP

## Skeleton starter (prefer this as the base)
- Path: packages/modules/skeleton/
- Module id: example.skeleton
- Build zip: pnpm --filter @placard/module-skeleton build:zip
- Output: packages/modules/skeleton/dist/example.skeleton-0.1.0.zip
- Includes GET /api/m/example.skeleton/hello, SkeletonPage, CMD+K action "Open Skeleton"
  (manifest actions → /m/example.skeleton), MCP tool skeleton_hello
  (global name example_skeleton__skeleton_hello), React host shims, build:zip script.
- Clone/rename that package (change id, paths, API constant, page export) instead of
  inventing a new layout.

## Other references
- Upload-oriented example: packages/modules/places-pick/
- Shipped restaurant wheel (bundled in the image): packages/modules/restaurants-decide/
- SDK types: packages/module-sdk/

## Out of scope
Sandboxing, public npm registry install into Placard, remote catalog URL, household-only gating in the manifest, compiling TS inside Docker.
````
