# woismeineporta.at — Design

**Date:** 2026-07-06
**Status:** Approved by Julian

## Purpose

A bestell.bar-style availability tracker for the Austrian market, for exactly one product family: the **Midea PortaSplit** (12.000 BTU, cools + heats, UVP €1.199) and the **Midea PortaSplit Cool** (8.000 BTU, cooling only, ~€300 cheaper). Both regularly sell out in summer. The site shows, per Austrian retailer, whether the product is orderable online and in which physical stores (Filialen) it is in stock, and notifies subscribers the moment it flips to available.

**Primary success criterion: lowest possible alert latency at €0/month hosting cost.** Worst-case target: ~90 seconds from a retailer flipping to "in stock" until the push notification arrives.

Not a shop. No checkout, no accounts. Language: German (Austrian market).

## Architecture

One Next.js (App Router, TypeScript, Tailwind) monolith deployed on **Vercel Hobby**. Persistent data in **Neon Postgres** (free tier) via **Drizzle ORM**. A tiny **Cloudflare Worker with a 1-minute cron trigger** is the scheduler: it does nothing but `fetch()` the app's secured check endpoint every minute (Vercel Hobby cron only fires daily; CF cron is the most reliable free 1-minute scheduler). Notifications fan out inside the same invocation that detects a stock flip.

```
CF Worker (cron: * * * * *)
    └─> POST /api/cron/check  (Bearer CRON_SECRET)
            ├─ run due retailer adapters (tiered: 1-min JSON APIs, 3–5-min HTML scrapes)
            ├─ normalize → diff against DB state
            ├─ write offers / store_availability / events
            └─ on out_of_stock → in_stock transitions: fan out Web Push + email

Browser ──> Next.js pages (server-rendered from DB, 60s revalidate)
        ──> /api/subscribe/* (push + email subscription management)
```

### Components

- **Retailer adapters** (`src/lib/retailers/*.ts`): one module per retailer implementing a common interface `check(): Promise<RetailerResult>` returning normalized online offers and (where supported) per-store availability. Each adapter is independently fault-isolated: a failing adapter yields `status: unknown` for its retailer and never breaks the run.
- **Diff engine** (`src/lib/diff.ts`): compares adapter results to stored state, persists changes, emits typed events (`online_restock`, `online_soldout`, `price_change`, `store_restock`, `store_soldout`).
- **Notifier** (`src/lib/notify/*`): consumes restock events, resolves matching subscriptions (variant match; for store events also PLZ + radius match via lat/lng distance), sends Web Push (`web-push`, VAPID) and email (Resend). Per-subscriber-per-offer cooldown (60 min) prevents flapping spam.
- **Web frontend**: single main page plus legal pages, PWA manifest + service worker (required for push, incl. iOS ≥16.4).

## Retailers (v1)

| Retailer | Online status | Store-level | Method | Tier |
|---|---|---|---|---|
| Bauhaus.at | ✓ | ✓ | public store-availability JSON endpoint | 1 min |
| Obi.at | ✓ | ✓ | public availability JSON endpoint | 1 min |
| Hornbach.at | ✓ | ✓ | public article-availability JSON endpoint | 1 min |
| MediaMarkt.at | ✓ | ✓ | GraphQL API (Akamai-protected — best effort) | 3–5 min |
| Tepto.at | ✓ | — | HTML scrape of product page | 3–5 min |

Amazon is explicitly out of scope for v1 (hardest bot protection, low signal). Exact endpoint URLs/shapes are discovered during implementation by inspecting each site's network traffic (agent-browser); the spec commits to the adapter interface, not to endpoints. If a retailer blocks datacenter IPs, its adapter degrades to `unknown` and the site stays honest about staleness (shows "zuletzt geprüft" timestamps).

## Data model (Postgres, Drizzle)

- `variants` — seeded: `portasplit`, `portasplit-cool` (slug, name, uvp).
- `retailers` — seeded: slug, name, homepage.
- `offers` — (retailer, variant) → url, price (cents), status `in_stock | out_of_stock | unknown`, lastCheckedAt, lastChangedAt.
- `stores` — retailer's physical locations: externalId, name, zip, city, lat, lng. Upserted from adapter results.
- `store_availability` — (store, variant) → inStock, lastCheckedAt, lastChangedAt.
- `events` — append-only feed: type, retailer, variant, store?, price?, createdAt. Powers the "Verlauf" feed; pruned to 90 days.
- `push_subscriptions` — endpoint, p256dh, auth, variant slugs[], zip?, radiusKm?, createdAt. Deleted on 404/410 push response.
- `email_subscriptions` — email, confirmToken, unsubscribeToken, confirmed, variant slugs[], zip?, radiusKm?.
- `check_runs` — per run: startedAt, adapter outcomes, duration (observability, pruned to 7 days).

PLZ→lat/lng resolution for subscriber radius matching uses a bundled Austrian postal-code lookup table (static JSON, ~2.500 rows) — no geocoding API.

## Pages & API

- `/` — hero, both variants side by side: per-retailer status cards (Bestellbar/Ausverkauft/Unbekannt, price, deep link, "zuletzt geprüft"), subscribe CTA, Filial-availability block (PLZ input → nearby stores with stock across chains), recent-changes feed.
- `/impressum`, `/datenschutz` — Austrian legal requirements (ECG/DSGVO), content placeholders for Julian to fill.
- `POST /api/cron/check` — Bearer-secured; runs due adapters, diffs, notifies. Responds with run summary.
- `POST /api/subscribe/push` / `DELETE` — store/remove push subscription with preferences.
- `POST /api/subscribe/email` → sends double-opt-in mail; `GET /api/subscribe/email/confirm?token=` ; `GET /api/subscribe/email/unsubscribe?token=`.
- `GET /api/stores?zip=&radius=&variant=` — powers the PLZ lookup client-side.
- Main page renders server-side from DB with 60s revalidation; the status data is also polled client-side every 60s for a live feel.

## Cron & tiering

The CF Worker fires every minute. The check endpoint decides internally which adapters are due (fast tier every run; slow tier when `minute % 3 == 0`), staggers requests, and uses conditional/If-Modified headers where supported. Total work per run: ≈5–15 HTTP requests, well under Vercel Hobby's function limits (~43k invocations/month, within free quota). `CRON_SECRET` shared between Worker and app.

## Notifications

- **Web Push** (primary): one-click subscribe on the page, per-variant selection, optional PLZ+radius for store alerts. Free, unlimited, instant. iOS requires the site installed as PWA — the UI explains this.
- **Email** (secondary): Resend free tier (100/day). Double opt-in, one-click unsubscribe link in every mail. If the daily cap is hit, email sends queue-drop with a logged warning; push is unaffected.
- Triggers: online `out_of_stock/unknown → in_stock`, and store flips to in-stock within a subscriber's radius. 60-min cooldown per subscriber+offer.

## Error handling

- Adapter failure (network, blocked, markup change) → offer status `unknown`, event logged, run continues. Repeated failure (>30 min) surfaces on the page as "Status unbekannt seit …".
- Push endpoint gone (410) → subscription deleted. Resend failure → logged, no retry loop.
- Cron endpoint is idempotent; overlapping runs guarded by a short DB advisory lock.

## Testing

Vitest. Adapters tested against saved fixture responses (JSON/HTML snapshots per retailer, including sold-out and in-stock states). Diff engine and notification-decision logic tested pure-unit (state before/after → expected events/recipients). No E2E in v1; manual verification with agent-browser.

## Cost & deployment

€0/month: Vercel Hobby (app), Neon free (DB), Cloudflare free (cron Worker), Resend free (email), VAPID keys self-generated. Deployment docs in README: Neon setup, Vercel env vars (`DATABASE_URL`, `CRON_SECRET`, `VAPID_*`, `RESEND_API_KEY`), CF Worker deploy via wrangler. Domain (e.g. woismeineporta.at) optional, works on `*.vercel.app` first.

## Out of scope (v1)

Amazon, price-history charts, map view of stores (list + distance instead), color-variant tracking (Grau/Pfirsich), accounts, admin UI (DB is the admin UI), Telegram.
