# First-user profile (founder)

Ground truth for prioritization. Not every user will match this; it defines what “good” feels like early.

## Habits (priority order)

1. **Import + browse** — Google Takeout in; card library that feels like *my* places
2. **Search the library** — beat Google Maps saved-places search (filters: open, radius, cuisine/type, tags, lists)
3. **Decide / spin for dinner** — “what should I eat tonight?” from my data
4. **Dish photos** — nice when used; upload now or later

## Scale & geography

- ~**500** places already
- Daily use: **one home city**, biased to **near me**
- Travel history: **multiple cities** still in the library, not the everyday default view

## Capture

- Prefer **PWA**; native app later maybe, not a v1 requirement
- Dish uploads: opportunistic, not mandatory ritual
- Online-only is fine

## Household (when used)

- Shared *and* private places
- Admin invites only
- Votes in-app only
- No guest/kid accounts

## Tech preferences that affect UX

- Instance Google key + optional per-member override
- Manual **Force refresh** of place details (no silent mass cron)
- Want / been-there as first-class status
- Optional visit history ≠ dish photos
- One long-lived install
- MCP must exist
- One-click backup desired
- AGPL-3.0 like Immich

## Search north star (example query)

> All restaurants open now within 5 km that do pizza

Deliver with **structured filters** first. Later: optional **local LLM** that maps natural language → those filters.
