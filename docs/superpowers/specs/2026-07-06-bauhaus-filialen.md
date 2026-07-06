# Bauhaus Filial-Verfügbarkeit

**Branch:** `feat/bauhaus-filialen`
**Status:** ✅ working end-to-end, verified live. No token/browser needed —
mergeable within the lightweight single-container model.

## Outcome

Per-store ("Fachcentrum") availability for Bauhaus, matching letzteklima.com —
but **without** the headless-browser/OAuth machinery we first assumed.

## The key finding

`api.bauhaus/v1/product-stock/at/products/{productId}/warehouses/{warehouseId}/stock`
authenticates with **just the public Apigee `apiKey`** (embedded in the PDP) plus
an allowed `Origin`/`Referer` — **no OAuth bearer token**. Our earlier 401s were
simply a missing `Origin` header.

- Live response: `{ "amount": 0, "availibility_level": "OUT_OF_STOCK" }` (sic).
- The `apiKey` is scraped from the same PDP the adapter already fetches
  (`apiKey: "…"`), so it self-heals if Bauhaus rotates it.

This means no persistent browser session (unlike letzteklima) and no new heavy
dependency — it fits the existing poller.

## Implementation

- `src/data/bauhaus-stores.json` — 23 AT Fachcentren (id, name, zip, city),
  harvested from `bauhaus.at/fachcentren/fachcentrensuche`; coordinates resolved
  from zip via the existing GeoNames PLZ table.
- `bauhaus-stores.ts` — `fetchBauhausStoreStock(fetchFn, apiKey)` sweeps every
  Fachcentrum (apikey + Origin headers), returns `StoreStock[]`. `parseStock`
  reads `{amount, availibility_level}`; 401/403 (rotated key) throws so the
  adapter degrades; per-store errors are skipped.
- `bauhaus.ts` — extracts the apiKey from the PDP HTML and includes storeStock;
  falls back to online-only if the key is missing/rejected.
- Fixture `__fixtures__/bauhaus-stock-warehouse.json` (real 200 response); tests
  for the parser and the sweep.

Verified live: adapter returns the online offer + 23 Fachcentren with per-store
stock in ~4.4s. The rest of the pipeline (persistence, map markers,
store-restock alerts, feed) works unchanged.

## Caveats / to watch

- Only `OUT_OF_STOCK` was observable (product sold out everywhere), so the
  positive `availibility_level` values (IN_STOCK/LOW_STOCK/…) are matched
  generously; confirm exact strings when a store restocks.
- The apiKey is public but could rotate — self-healing via PDP scrape covers
  that; a hard 401/403 just degrades to online-only.
- Runs on the slow tier (23 requests/sweep, once every 180s) — polite.

## Merge note

Because it needs no browser/token, this can merge to `main`. Doing so triples
the map's coverage (OBI 79 + Bauhaus 23 Fachcentren) and enables Bauhaus
store-restock alerts.
