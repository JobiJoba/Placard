// src/server/create-module.ts
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
var defaults = { avoidRecent: true, avoidRecentDays: 14 };
var preferencePath = (root, owner) => join(root, "data", "preferences", `${createHash("sha256").update(owner).digest("hex")}.json`);
async function readPreferences(root, owner) {
  try {
    return JSON.parse(await readFile(preferencePath(root, owner), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { ...defaults };
    throw error;
  }
}
function validateDays(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 365)
    throw new Error("Choose a whole number of days between 1 and 365");
  return value;
}
var json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
var resolveRootDir = (ctx) => {
  if (typeof ctx.rootDir === "string" && ctx.rootDir.length > 0) return ctx.rootDir;
  const base = process.env.PLACARD_MODULES_DIR?.trim() || "./data/modules";
  return join(base, ctx.moduleId);
};
var resolveOwnerId = (ctx) => typeof ctx.ownerId === "string" && ctx.ownerId.length > 0 ? ctx.ownerId : "unknown";
var defaultHostFetch = async (request, path, init) => {
  const url = new URL(path, request.url);
  const headers = new Headers(init?.headers);
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  const origin = request.headers.get("origin") ?? url.origin;
  headers.set("origin", origin);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(url, { ...init, headers });
};
var hostFetchFor = (request, ctx) => {
  if (ctx.hostFetch) return ctx.hostFetch;
  if (request) {
    return (path, init) => defaultHostFetch(request, path, init);
  }
  return async () => {
    throw new Error("hostFetch is required when no inbound Request is available");
  };
};
var readPicks = async (rootDir) => {
  try {
    const raw = await readFile(join(rootDir, "data", "picks.json"), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
var writePicks = async (rootDir, rows) => {
  const dir = join(rootDir, "data");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "picks.json"), JSON.stringify(rows, null, 2));
};
var recentIds = (rows, ownerId, now, days) => {
  const cutoff = now - days * 24 * 60 * 60 * 1e3;
  return new Set(
    rows.filter((row) => row.ownerId === ownerId && Date.parse(row.pickedAt) >= cutoff).map((row) => row.placeId)
  );
};
var emptyMessage = (request) => {
  if (request.open === "tonight") {
    return "Nothing open tonight matches these filters. Try turning off open tonight, widening the radius, or disabling avoid recent.";
  }
  if (request.open === "now") {
    return "Nothing open now matches these filters. Try turning off open now, widening the radius, or disabling avoid recent.";
  }
  if (request.category) {
    return `No ${request.category} places match these filters. Try a different list, tag, or radius \u2014 or turn off avoid recent.`;
  }
  return "No places match these filters. Try a different list, tag, or radius \u2014 or turn off avoid recent.";
};
var parsePickRequest = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Expected an object");
  const category = typeof body.category === "string" ? body.category.trim() : body.category;
  if (category != null && (typeof category !== "string" || category.length > 80 || body.category !== "" && category.length === 0)) {
    throw new Error("Invalid category: use a place type between 1 and 80 characters");
  }
  const filter = {
    avoidRecent: body.avoidRecent === true
  };
  if (body.avoidRecentDays !== void 0) filter.avoidRecentDays = validateDays(body.avoidRecentDays);
  if (typeof category === "string" && category !== "") filter.category = category;
  if (body.open === "now" || body.open === "tonight") filter.open = body.open;
  if (typeof body.text === "string") filter.text = body.text;
  if (body.near && typeof body.near === "object") {
    const near = body.near;
    if (typeof near.lat === "number" && typeof near.lng === "number") {
      filter.near = { lat: near.lat, lng: near.lng };
    }
  }
  if (typeof body.radiusKm === "number") filter.radiusKm = body.radiusKm;
  if (typeof body.tag === "string") filter.tag = body.tag;
  if (typeof body.list === "string") filter.list = body.list;
  if (typeof body.status === "string") filter.status = body.status;
  return filter;
};
var parseBody = async (request) => {
  const body = await request.json();
  return parsePickRequest(body);
};
var toSearchPayload = (pickRequest) => {
  const { avoidRecent: _, avoidRecentDays: _days, ...filter } = pickRequest;
  return filter;
};
var queryPool = async (fetchHost, rootDir, ownerId, pickRequest) => {
  const searchRes = await fetchHost("/api/search", {
    method: "POST",
    body: JSON.stringify(toSearchPayload(pickRequest))
  });
  if (!searchRes.ok) {
    throw new Error(`Search failed (${searchRes.status})`);
  }
  let hits = await searchRes.json();
  if (pickRequest.avoidRecent) {
    const rows = await readPicks(rootDir);
    const days = pickRequest.avoidRecentDays ?? (await readPreferences(rootDir, ownerId)).avoidRecentDays;
    const recent = recentIds(rows, ownerId, Date.now(), days);
    hits = hits.filter((hit) => !recent.has(hit.place.id));
  }
  return hits;
};
var spinOnce = async (fetchHost, rootDir, ownerId, pickRequest) => {
  const hits = await queryPool(fetchHost, rootDir, ownerId, pickRequest);
  if (hits.length === 0) {
    return { ok: false, message: emptyMessage(pickRequest) };
  }
  const index = Math.floor(Math.random() * hits.length);
  const hit = hits[index];
  if (!hit) {
    return { ok: false, message: emptyMessage(pickRequest) };
  }
  const rows = await readPicks(rootDir);
  rows.push({
    ownerId,
    placeId: hit.place.id,
    pickedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  await writePicks(rootDir, rows);
  return { ok: true, place: hit.place };
};
var pickPlaceInputSchema = {
  type: "object",
  properties: {
    category: {
      type: "string",
      minLength: 1,
      maxLength: 80,
      description: "Optional Placard place type, including custom types. Omit for any type."
    },
    text: { type: "string" },
    open: { type: "string", enum: ["now", "tonight"] },
    near: {
      type: "object",
      properties: { lat: { type: "number" }, lng: { type: "number" } }
    },
    radiusKm: { type: "number" },
    tag: { type: "string" },
    list: { type: "string" },
    status: { type: "string", enum: ["want_to_go", "been_there"] },
    avoidRecent: { type: "boolean" },
    avoidRecentDays: { type: "integer", minimum: 1, maximum: 365, description: "Exclusion window in days; defaults to your saved preference." }
  }
};
var pickPlaceToolDef = {
  name: "pick_place",
  title: "Pick a place",
  description: "Pick one place from your library (any category, open now/tonight, list/tag/radius, optional avoid-recent). Same rules as the Pick wheel.",
  inputSchema: pickPlaceInputSchema
};
var handlePickPlace = async (args, ctx) => {
  try {
    const pickRequest = parsePickRequest(args);
    const result = await spinOnce(ctx.hostFetch, ctx.rootDir, ctx.ownerId, pickRequest);
    if (!result.ok) {
      return { ok: false, error: result.message };
    }
    return {
      ok: true,
      data: {
        id: result.place.id,
        name: result.place.name,
        address: result.place.address ?? null,
        category: result.place.category
      }
    };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Pick failed" };
  }
};
function createModule() {
  return {
    createHttpApp: async (request, ctx) => {
      const path = ctx.pathSuffix.replace(/^\/+/, "");
      const rootDir = resolveRootDir(ctx);
      const ownerId = resolveOwnerId(ctx);
      const fetchHost = hostFetchFor(request, ctx);
      try {
        if (path === "preferences") {
          if (!ctx.ownerId) return json({ message: "Authentication required" }, 401);
          if (request.method === "GET") return json(await readPreferences(rootDir, ownerId));
          if (request.method === "PUT") {
            const body = await request.json();
            if (!body || typeof body.avoidRecent !== "boolean") throw new Error("avoidRecent must be a boolean");
            const preferences = { avoidRecent: body.avoidRecent, avoidRecentDays: validateDays(body.avoidRecentDays) };
            const target = preferencePath(rootDir, ownerId);
            await mkdir(join(rootDir, "data", "preferences"), { recursive: true });
            const temporary = `${target}.${randomUUID()}.tmp`;
            await writeFile(temporary, JSON.stringify(preferences));
            await rename(temporary, target);
            return json(preferences);
          }
          return json({ message: "Use GET or PUT" }, 405);
        }
        if (request.method === "GET" && (path === "" || path === "meta")) {
          const response = await fetchHost("/api/me/place-types");
          if (!response.ok) return json({ message: `Could not load Placard place types (${response.status})` }, 502);
          const { types } = await response.json();
          return json({ id: "places.pick", categories: types });
        }
        if (request.method === "POST" && path === "preview") {
          const pickRequest = await parseBody(request);
          const hits = await queryPool(fetchHost, rootDir, ownerId, pickRequest);
          return json({ count: hits.length });
        }
        if (request.method === "POST" && path === "spin") {
          const pickRequest = await parseBody(request);
          const result = await spinOnce(fetchHost, rootDir, ownerId, pickRequest);
          if (!result.ok) {
            return json({ _tag: "PickPoolEmpty", message: result.message }, 404);
          }
          return json({ place: result.place });
        }
        return json({ message: "Not found" }, 404);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Pick failed";
        return json({ message }, 400);
      }
    },
    mcpTools: [
      {
        def: pickPlaceToolDef,
        handler: handlePickPlace
      }
    ]
  };
}
export {
  createModule
};
