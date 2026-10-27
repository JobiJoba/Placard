# Data model — v0.1

The tables behind [mvp.md](mvp.md). Each table has a matching Effect Schema for its domain type; Drizzle table definitions live in `src/db/schema.ts`.

Tables are added by the phase that needs them ([implementation-phases.md](implementation-phases.md)). Phase 0 only creates the PostGIS extension and `users`.

## Conventions

- **IDs**: text, generated in the app (UUIDv7, so they sort by creation time). Better Auth also uses text IDs.
- **Timestamps**: `timestamptz`, stored in UTC. `created_at` and `updated_at` on every table.
- **Ownership**: every user-owned row has `owner_id → users.id`. Queries always filter by owner (or, later, by household membership).
- **Visibility**: user-owned content carries `visibility` (`private` now; `household` arrives in v0.2). This keeps household from needing a migration on every table.
- **Soft delete**: places carry `deleted_at`. Rows with `deleted_at` set are hidden everywhere except "Recently deleted"; a job purges them after 30 days.
- **Distances**: stored in metres, converted to km or miles only for display.
- **Geo**: `geography(Point, 4326)` with a GiST index.
- **Naming**: snake_case in SQL, camelCase in TypeScript (Drizzle maps them).

## Entity overview

```
users ─┬─< places ─┬─< place_facts
       │           ├─< place_tags >── tags
       │           ├─< list_items >── lists
       │           ├─< media
       │           └─< decide_picks
       ├─< import_runs ─< import_entries ──> places (once committed)
       └─< api_tokens
       └─< invitations (invited_by)
instance_settings (single row)
sessions, accounts, verifications   (Better Auth)
```

## Tables

### `users` (Phase 0)

Better Auth's user table, mapped to the name `users`, plus Placard fields.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `name` | text | |
| `email` | text unique | |
| `email_verified` | boolean | default false |
| `image` | text null | |
| `role` | text | `admin` \| `member`; first signup is `admin` |
| `distance_unit` | text | `km` \| `mi`, default `km` |
| `created_at`, `updated_at` | timestamptz | |

### Better Auth tables (Phase 1)

`sessions`, `accounts`, `verifications`, using Better Auth's standard columns (snake_case). `sessions` and `accounts` cascade when a user is deleted. Not described further here.

### `invitations` (Phase 1)

One-time signup links created by the admin. Only a SHA-256 hash of the token is stored; the link itself is shown once.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `email` | text | Lowercased; signup must use this email |
| `token_hash` | text unique | |
| `role` | text | `admin` \| `member`, default `member` |
| `invited_by` | text FK users null | set null on delete |
| `expires_at` | timestamptz | 7 days after creation |
| `accepted_at`, `revoked_at` | timestamptz null | A new invite for the same email revokes older pending ones |
| `created_at`, `updated_at` | timestamptz | |

### `instance_settings` (Phase 1)

A single row (`id = 1`).

| Column | Type | Notes |
| --- | --- | --- |
| `google_api_key` | text null | Overrides the `GOOGLE_MAPS_API_KEY` env var when set |
| `signup_open` | boolean | true until the first user exists; the first signup flips it atomically. Seeded by the migration (false if users already exist) |
| `updated_at` | timestamptz | |

### `places` (Phase 2)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `owner_id` | text FK users | |
| `visibility` | text | `private` |
| `name` | text | Current display name (manual override wins) |
| `category` | text | `restaurant`, `cafe`, `bar`, `park`, `museum`, `cinema`, `hotel`, `trail`, `other` |
| `location` | geography(Point) | Null only for unresolved import entries that were kept |
| `address` | text null | |
| `google_place_id` | text null | Unique per owner when set (duplicate guard) |
| `status` | text | `want_to_go` \| `been_there` \| null |
| `notes` | text null | Markdown |
| `utc_offset_minutes` | int null | From Google, used for open-now |
| `source` | text | `manual` \| `autocomplete` \| `map_pick` \| `takeout` \| `mcp` |
| `import_run_id` | text null FK | Set when created by an import (enables "undo import") |
| `last_enriched_at` | timestamptz null | |
| `deleted_at` | timestamptz null | Soft delete |
| `created_at`, `updated_at` | timestamptz | |

Indexes: GiST on `location`; unique `(owner_id, google_place_id)` where not null and not deleted; trigram on `name`; `(owner_id, deleted_at)`.

### `place_facts` (Phase 4)

Enrichment values with provenance. One row per place per fact key.

| Column | Type | Notes |
| --- | --- | --- |
| `place_id` | text FK places | |
| `key` | text | `opening_hours`, `phone`, `website`, `price_level`, `rating`, `cuisine`, `types`, … |
| `value` | jsonb | Shape depends on `key`; each key has an Effect Schema |
| `source` | text | `google` \| `manual` \| `takeout` |
| `is_override` | boolean | Manual overrides survive refreshes |
| `fetched_at` | timestamptz | |

PK `(place_id, key, source)`. The effective value for a key is the override if one exists, otherwise the latest fetched value.

`opening_hours` follows Google's `regularOpeningHours.periods` shape (day + hour + minute for open and close), so open-now can be computed locally with `utc_offset_minutes`.

### `tags` and `place_tags` (Phase 3)

`tags`: `id`, `owner_id`, `name` (unique per owner, case-insensitive), `color` null, timestamps.
`place_tags`: `place_id`, `tag_id`, PK on both.

### `lists` and `list_items` (Phase 3)

`lists`: `id`, `owner_id`, `visibility`, `name`, `description` null, `import_run_id` null, timestamps.
`list_items`: `list_id`, `place_id`, `position` null (ordering is optional), `added_at`. PK `(list_id, place_id)`.

### `media` (Phase 7)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `owner_id`, `place_id` | text FK | |
| `kind` | text | `dish` \| `photo` \| `attachment` |
| `path` | text | Relative to the media volume |
| `thumb_path` | text null | |
| `mime_type`, `bytes`, `width`, `height` | | |
| `caption` | text null | E.g. dish name |
| `taken_at` | timestamptz null | |
| `created_at` | timestamptz | |

### `import_runs` (Phase 6)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `owner_id` | text FK | |
| `status` | text | `parsing` \| `triage` \| `committing` \| `done` \| `undone` \| `failed` |
| `source_fingerprint` | text | Hash of the export, to recognize re-imports |
| `counts` | jsonb | parsed / kept / skipped / matched / needs_review |
| `created_at`, `committed_at`, `undone_at` | timestamptz | |

### `import_entries` (Phase 6)

The staging table for free triage. Nothing here costs an API call.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `run_id` | text FK import_runs | |
| `owner_id` | text FK | |
| `dedupe_key` | text | Stable key across re-imports (CID, feature id, or name + rounded coordinates) |
| `source_file` | text | E.g. `Saved/Want to go.csv` |
| `source_list` | text null | List name derived from the file |
| `name`, `address`, `country_code`, `note` | text null | |
| `location` | geography(Point) null | Null for unresolved entries (`[0,0]` / no location) |
| `google_maps_url` | text null | |
| `cid`, `feature_id` | text null | Matching signals |
| `saved_at` | timestamptz null | |
| `decision` | text | `pending` \| `keep` \| `skip` |
| `match_status` | text | `unmatched` \| `matched` \| `needs_review` \| `failed` |
| `place_id` | text null FK places | Set on commit |

Skips are remembered across re-imports through `(owner_id, dedupe_key)`.

### `decide_picks` (Phase 8, owned by the `restaurants.decide` module)

`id`, `owner_id`, `place_id`, `picked_at`. Used for avoid-recent. The module owns this table; core never reads it.

### `api_tokens` (Phase 9)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `owner_id` | text FK | |
| `name` | text | E.g. "Cursor on laptop" |
| `token_hash` | text unique | SHA-256 of the token; the token itself is shown once |
| `last_used_at`, `revoked_at` | timestamptz null | |
| `created_at` | timestamptz | |

### `mcp_audit` (Phase 9)

`id`, `token_id`, `tool`, `input` jsonb (sensitive fields redacted), `ok` boolean, `created_at`.

## Jobs

pg-boss keeps its own tables in a `pgboss` schema, created by pg-boss itself.
