# Bauhaus Filial-Verfügbarkeit (experimental)

**Branch:** `feat/bauhaus-filialen`
**Status:** plumbing complete + tested; token acquisition is the open piece.

## Goal

Add per-store ("Fachcentrum") availability for Bauhaus, matching what
letzteklima.com shows. Today our Bauhaus adapter is online-status-only because
the store-level API needs auth.

## What we learned (from letzteklima.com + our own probing)

- letzteklima serves a precomputed `data.json` with **per-store Bauhaus stock**
  keyed by warehouse id (`bauhaus:758` = Salzburg, etc.), 22–23 AT Fachcentren.
- The data comes from `api.bauhaus/v1/product-stock/at/products/{productId}/warehouses/{warehouseId}/stock`.
- That gateway (Apigee) requires an **OAuth bearer token** on every route —
  the public `apiKey` in the page is rejected (`oauth.v2.InvalidAccessToken`).
- The token is **minted at runtime by the browser** through a flow behind
  Cloudflare (the page loads `jwt-decode` and holds an empty `apigeeAccessToken`
  that gets filled in the reserve/stock flow). Standard Apigee token endpoints
  refuse the public key, and the reserve flow only fires when a store is
  selected and stock > 0 — so it can't be captured while everything is sold out.
- letzteklima almost certainly runs a **persistent/headless browser** to mint
  and refresh the token, then reuses it for cheap per-warehouse API calls. Their
  backend is separate from serving, so that operational weight is fine for them.

## What this branch implements

- `src/data/bauhaus-stores.json` — all 23 AT Fachcentren (id, name, zip, city),
  harvested from `bauhaus.at/fachcentren/fachcentrensuche`. Coordinates are
  resolved from zip via our existing GeoNames PLZ table.
- `src/lib/retailers/bauhaus-stores.ts` — `fetchBauhausStoreStock(fetchFn, token)`
  sweeps every Fachcentrum via the product-stock endpoint and returns
  `StoreStock[]`. 401 → throws (caller refreshes token); per-store errors are
  skipped. `parseStock()` is defensive (availableQuantity / stockLevel /
  quantity / available / inStock) because the live 200 shape is **unverified**.
- `src/lib/retailers/bauhaus-token.ts` — `getBauhausToken()`; reads
  `BAUHAUS_ACCESS_TOKEN` env for now, returns null otherwise.
- `bauhaus.ts` adapter — when a token is present, includes `storeStock`; else
  `null` (degrades to today's online-only behaviour). Once storeStock flows,
  the existing pipeline (persistence, map markers, store-restock alerts, feed)
  lights up automatically — no other changes needed.
- Tests cover the parser and the sweep (geo resolution, auth header, 401,
  per-store error isolation).

## What's left to make it live

1. **Obtain a token.** Fastest validation: paste a bearer captured from a real
   browser session into `BAUHAUS_ACCESS_TOKEN` and run `/api/admin/check`.
2. **Confirm the response shape** of a live 200 and tighten `parseStock`.
3. **Automate token minting** — a small headless-browser (Playwright) worker
   that mints + refreshes the token on 401, run outside the main container (or
   as an opt-in dependency). This is the deliberate trade-off: it breaks the
   "one lightweight container" model, which is why it lives on a branch.

## Cross-check

Bauhaus warehouse ids and the AT Fachcentrum set match letzteklima's data,
and our earlier finding that Hornbach delisted the product is confirmed by
their `data.json` too.
