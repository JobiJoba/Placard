# Google APIs (full setup)

Placard uses **one** Google Maps Platform API key for both the browser map and server-side Places calls (BYOK — your bill, your quota). Without a key the app still runs; with a key you get the full Places experience.

CRUD, Takeout triage, OSM pin-drop, and MCP work **without** a Google key. See [install.md](install.md) for Compose / Coolify / Dokploy.

**On this page**

1. [What the key unlocks](#what-the-key-unlocks)
2. [Which APIs to enable](#which-apis-to-enable)
3. [Create a project and key](#create-a-project-and-key)
4. [Restrict the key](#restrict-the-key-important)
5. [Put the key in Placard](#put-the-key-in-placard)
6. [Smoke-check](#smoke-check-the-full-install)
7. [Cost expectations](#cost-expectations)

## What the key unlocks

| Feature | Without key | With key |
| --- | --- | --- |
| Add place by name (autocomplete) | — | Places Autocomplete (New) |
| Click a POI on the Add map | OSM pin only | Maps JavaScript + Place ID |
| Enrichment (hours, phone, website, rating, cover) | Manual / empty | Place Details (New) + photo media |
| Takeout import matching | Name/coords only | Text Search / Details for Place IDs |
| Open-now / pick-wheel filters on hours | Only if you typed hours | Hours from Google, computed locally |

## Which APIs to enable

In [Google Cloud Console → APIs & Services → Library](https://console.cloud.google.com/apis/library), enable **both**:

1. **Places API (New)** — server calls: Autocomplete, Place Details, Text Search, photo media
2. **Maps JavaScript API** — browser map on Add place (POI clicks)

You do **not** need the legacy Places API, Geocoding API, or Directions API for Placard.

## Create a project and key

1. Open [Google Cloud Console](https://console.cloud.google.com/) and sign in with the Google account that will own billing.
2. Create a project (or pick an existing one) — e.g. `placard-home`.
3. Link a **billing account**. Maps Platform requires billing even when you stay inside the monthly free credit. Set a budget alert.
4. Enable **Places API (New)** and **Maps JavaScript API** (links above).
5. **APIs & Services → Credentials → Create credentials → API key**.
6. Restrict the key (recommended before any public deploy).

## Restrict the key (important)

| Restriction | Recommendation |
| --- | --- |
| **API restrictions** | Restrict key to **Places API (New)** and **Maps JavaScript API** only |
| **Application restrictions** | Prefer **None** for a self-hosted instance, *or* IP allowlist if your server has a stable egress IP. **Do not** use HTTP-referrer-only restrictions: Placard’s server calls Places with no browser referrer, so referrer-locked keys fail enrichment / autocomplete |
| **Quota** | Set a **daily quota cap** on Places (New) and Maps JavaScript so a runaway import cannot surprise-bill you |

One key is intentional: the same value is used in the browser (map) and on the server (Places). Treat it like a secret that is also visible to signed-in users’ browsers — API + quota restrictions are the real guardrails.

## Put the key in Placard

Either:

- Set `GOOGLE_MAPS_API_KEY=...` in `.env` and recreate/restart the `app` (and `worker`) containers, **or**
- After first signup: **Settings → Integrations** (admin) — Placard tests the key with a cheap Places call before saving

```sh
GOOGLE_MAPS_API_KEY=your-key-here
```

Changing the env var does not wipe a key already saved in Settings; the UI value wins when present.

## Smoke-check the full install

1. Settings → Integrations → key saves without error
2. **Add place** → type a restaurant name → pick a suggestion → save
3. Place card shows hours / phone when Google has them; cover may appear from Places photos
4. **Add place** map: click a Google POI → preview → add
5. Optional: import a small Takeout slice and confirm matches get Place IDs

If Autocomplete works but the map is blank, Maps JavaScript is missing or blocked. If the map works but save/enrich fails, Places API (New) is missing, referrer-restricted, or quota-exhausted.

## Cost expectations

Personal / household use usually stays inside Google’s monthly Maps Platform credit. Large Takeout commits and mass “refresh all” enrichment are what burn quota — triage Takeout before import, and prefer per-place refresh.

Next: [install.md](install.md) · [MCP](mcp.md)
