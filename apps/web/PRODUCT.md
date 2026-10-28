# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user is the founder / first user: self-hosts one long-lived instance, keeps on the order of hundreds of saved places, uses the library daily with a near-home bias, and keeps travel cities in the library without making them the everyday default. Solo chrome is the default; household is optional later. Design for this person first, not a broad marketplace audience.

## Product Purpose

Placard is a self-hosted place library: first build a private collection (import or manual add), then arrange and enrich it (lists, facts, photos), then return to *use* that collection — browse, filter, and get inspiration from your own cards (e.g. tonight’s restaurants from the ones you saved). Modules (restaurants first: “what to eat tonight”) are the planned utility layer *after* cards exist; they are not the first-run job. Success is ownership of a living collection that becomes useful over time — not public discovery.

## Positioning

Immich-adjacent for starred places: Compose-up, data on your disk, private to you (or later a household). Beats Google Maps Saved for structured search over *your* library (“pizza, open, within 5 km”). Tagline: *Your places. On your cards. On your server.*

## Operating Context

PWA-first web client against a self-hosted API (Effect HttpApi, PostGIS, Better Auth). Lifecycle: (1) first open / thin library — import Takeout or add places manually to seed the collection; (2) curate — lists, enrichment, photos, status; (3) return visits — city/near-me library as the working surface over *your* data for inspiration and choice (e.g. pick among tonight’s restaurants). Google Places BYOK is optional; CRUD works without a key. No offline mode for now. Restaurant modules (Decide / “what to eat tonight”, household vote, dishes) and MCP come after the card collection is real; design the Library so that future utility feels inevitable, without shipping those modules in this pass.

## Capabilities and Constraints

- Confirmed in product: places with want/been status, tags/lists, soft-delete, media on places, Takeout import triage, city-scoped library, auth/settings.
- Privacy: instance is for the operator (and later invited household members only). Do not design for public sharing, social feeds, or outbound data sharing with third parties beyond user-initiated BYOK calls the operator configures.
- Data on disk may be reshaped for UX experiments; there is no external audience depending on a frozen public schema.
- Undecided / later: Decide spin UX, household chrome, natural-language search, native apps.

## Brand Commitments

- Product name: **Placard**
- Tagline: *Your places. On your cards. On your server.*
- License intent: AGPL-3.0 (Immich-comparable self-hosted copyleft)
- Feels at home next to Immich / Paperless / Jellyfin; not a consumer SaaS brand

## Evidence on Hand

- Product docs under `docs/` (overview, first-user, mvp, decisions, naming, vision)
- Runnable web UI in `apps/web` (library, place, import, lists, auth, settings, deleted)
- Anonymized Takeout fixtures in `test/fixtures/takeout/`
- Do not fabricate testimonials, customer logos, benchmarks, or public user counts

## Product Principles

1. **Own the library** — Places stay on the user’s server; design never assumes a public social layer.
2. **Collect, then use** — First-run success is a seeded collection; return-visit success is useful inspiration from those cards. Modules wait until the collection exists.
3. **Founder-true scope** — Optimize for one serious personal install and near-me daily use, not onboarding tourists.
4. **Enrichment is optional** — Core browse and edit must work without Google; BYOK is a power-up, not a gate.
5. **Private by default** — Visibility is personal (and later household-internal); never “share to the internet.”
