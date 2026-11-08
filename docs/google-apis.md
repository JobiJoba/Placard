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
3. Link a **billing account**. Maps Platform requires billing even when you stay inside the monthly free allowances. Set a budget alert.
4. Enable **Places API (New)** and **Maps JavaScript API** (links above).
5. **APIs & Services → Credentials → Create credentials → API key**.
6. Restrict the key (recommended before any public deploy).

## Restrict the key (important)

| Restriction | Recommendation |
| --- | --- |
| **API restrictions** | Restrict key to **Places API (New)** and **Maps JavaScript API** only |
| **Application restrictions** | Choose **None** for the shared key. Website restrictions block server-side Places calls, and server-IP restrictions block the browser map. Under **API restrictions**, choose **Restrict key** and select the two APIs above. |
| **Quota** | Set a **daily quota cap** on Places (New) and Maps JavaScript so a runaway import cannot surprise-bill you |

One key is intentional: the same value is used in the browser (map) and on the server (Places). Treat it like a secret that is also visible to signed-in users’ browsers — API + quota restrictions are the real guardrails.

## Put the key in Placard

Either:

- Set `GOOGLE_MAPS_API_KEY=...` in `.env` and recreate/restart the `app` (and `worker`) containers, **or**
- During first-admin onboarding: **Connect Google Maps**, or later in **Settings → Integrations** (admin) — Placard tests the key with a cheap Places call before saving

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

Google provides monthly free usage **per SKU**, shared across projects on a billing account. Place Details, autocomplete sessions, photos, text searches and map loads have different allowances. There is no single shared monthly Maps credit.

**Settings → Usage & budget** (admin) shows instance-wide local estimates, progress toward each free allowance, request sources, and an optional monthly budget in USD. Costs also appear before imports and bulk refreshes. The standard global pay-as-you-go price catalog is dated in the page; subscriptions, volume discounts, negotiated rates, taxes and currency conversion are not included.

Tracking starts when the budget migration is applied. It cannot see earlier requests or usage by other apps, projects or instances. Changing the key does not reset the ledger. Free allowances are excluded from cost estimates by default; enable “Apply the full monthly free allowances” only if they are available to this instance. The allowance bars always assume no outside usage. Month boundaries use US Pacific time.

Enable “Pause requests” to prevent new Placard requests whose estimated cost would exceed the limit. A zero-dollar limit allows only requests estimated to be free. The web server and worker share the same ledger and serialize budget checks. Cached details do not add usage. Attempts with an unknown billing outcome remain counted conservatively; each retry is another attempt. Autocomplete requests are initially counted individually, then reclassified as free after a successful eligible session completion. Map loads are reserved before mounting the map, so interrupted loads may overcount.

The pause applies only to requests made through Placard. Imports may finish with manually saved, needs-review places when Google requests are blocked; refreshes can finish partially. Increasing the budget permits new requests; failed refresh jobs are not automatically resumed. Google Cloud budget alerts are informational, not a hard spending cap. Use Google Cloud quotas and key restrictions as additional controls, and check the Google billing console for reported costs.

Large Takeout commits and mass refreshes consume allowances quickly. Triage Takeout before import, and prefer per-place refresh.

Next: [install.md](install.md) · [MCP](mcp.md)
