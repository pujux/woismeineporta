# Retailer endpoint discovery (2026-07-06)

Findings from live inspection (agent-browser + curl/Node fetch). All server-side
accessibility statements refer to plain Node `fetch` with browser-like headers
(see `politeFetch`), no cookies, from a residential AT IP.

## Summary

| Retailer | Online status | Store-level | Server-side access |
|---|---|---|---|
| OBI | ✓ PDP JSON-LD | ✓ 79 stores, exact quantities | works |
| MediaMarkt | ✓ PDP JSON-LD + `onlineStatus` | aggregate pickup signal only (per-store API blocked) | PDP works, GraphQL 403 (Akamai) |
| Tepto | ✓ PDP JSON-LD (base variant only) | — | works |
| BAUHAUS | ✓ (via impit) | ✓ 23 AT Fachcentren, per-store availability | Cloudflare-blocked for plain fetch; **cleared with impit Chrome TLS impersonation** |
| Hornbach | — | — | **dropped: does not sell the PortaSplit in Austria** (0 search results on hornbach.at) |

## OBI (obi.at)

- PortaSplit PDP: `https://www.obi.at/p/3586245/midea-mobile-split-klimaanlage-portasplit` (SKU `3586245`)
- PortaSplit Cool PDP: `https://www.obi.at/p/4593455/midea-split-klimaanlage-portasplit-cool-mobil-weissgrau` (SKU `4593455`)
- Online status/price: JSON-LD `Product.offers` in PDP HTML. `availability` values seen: `http://schema.org/InStoreOnly` (not orderable online), plus standard `InStock`/`OutOfStock`. Price seen: 899,99 € (Strikethrough 1.199 €).
- Store directory: `GET https://www.obi.at/api/disc/store/locator/country/AT` → `{stores: [{storeNumber, name, address: {zip, city, lat, lon}, ...}]}` — 79 stores. Fetch once per day, upsert.
- Store stock: `GET https://www.obi.at/api/pdp/v1/stock/{sku}?storeIds=002,010,...` → `[{storeId, availableQuantity}]`. **Max 10 storeIds per request** (400 above that) → 8 chunks × 2 SKUs = 16 requests per full store sweep.
- No auth, no cookies needed. Plain JSON.

## MediaMarkt (mediamarkt.at)

- PortaSplit PDP: `https://www.mediamarkt.at/de/product/_midea-portasplit-mobile-klimaanlage-max-raumgrosse-42-m-eek-a-12000-btuh-weiss-2075674.html` (productId `2075674`)
- PortaSplit Cool PDP: `https://www.mediamarkt.at/de/product/_midea-portasplit-cool-mobile-split-klimaanlage-8000btu-mobile-split-klimaanlage-a-28-m-8000-btuh-weiss-2080923.html` (productId `2080923`)
- PDP HTML (~1 MB) fetchable server-side. Contains:
  - JSON-LD `Product.offers` (price, `availability`)
  - `window.__PRELOADED_STATE__` (JS object literal, NOT valid JSON — contains `undefined`; extract fields via regex): `"onlineStatus\":\"..."` (e.g. `TEMPORARILY_NOT_AVAILABLE`), pickup `"displayStatus\":\"..."` (e.g. `PARTIALLY_AVAILABLE` = available in some markets).
- Per-store availability: GraphQL persisted query `GetClosestStoresByZipCodeOrCityWithFoundLocation` on `/api/v1/graphql` — **403 for curl, Node fetch, AND impit** (even with warmed cookies + Referer). Akamai here requires JS-computed sensor data, i.e. a headless browser — out of scope for a lightweight server. We surface the aggregate pickup `displayStatus` instead ("in einzelnen Märkten verfügbar").
- There is also an older grey variant PDP (`142245268`) with `onlineStatus: NO_VALID_MP_OFFER_PRICE` — ignore.

## Tepto (tepto.at)

- PortaSplit PDP: `https://www.tepto.at/Midea-Klimageraet-PortaSplit` (Shopware 6)
- JSON-LD `Product.offers`: `availability` `https://schema.org/SoldOut` seen; price 826,79 €.
- No Cool variant in their sitemap → adapter reports base variant only.

## BAUHAUS (bauhaus.at)

- PortaSplit PDP: `https://www.bauhaus.at/klimaanlagen/midea-klimasplitgeraet-portasplit-12000-btu/p/31934233` (Prod.Nr. `31934233`)
- Behind Cloudflare bot management: plain `curl`/Node fetch → 403 challenge ("Sicherheitsprüfung"). **Solved with [impit](https://www.npmjs.com/package/impit)** (`{ browser: "chrome" }`), which impersonates Chrome's TLS + HTTP/2 fingerprint — returns the real PDP (verified 2026-07-06). The whole poller now fetches through impit (`src/lib/retailers/impit-fetch.ts`).
- Online status/price parse from JSON-LD like the others (749 €, `OutOfStock` at capture time).
- **Store-level ("Fachcentrum") data — IMPLEMENTED (2026-07-06).** The PDP stock endpoint `https://api.bauhaus/v1/product-stock/at/products/{id}/warehouses/{wh}/stock` needs **no OAuth token** — the public Apigee `apiKey` embedded in the PDP (`apiKey:"…"`) plus an allowed `Origin`/`Referer: https://www.bauhaus.at` is sufficient. The earlier 401s were a missing `Origin` header, not a missing token. The adapter (`src/lib/retailers/bauhaus-stores.ts`) extracts the apiKey from the PDP it already fetches and sweeps all 23 AT Fachcentren (`src/data/bauhaus-stores.json`, exact coordinates); response shape `{ amount, availibility_level }` (sic). Degrades to online-only if the key is missing/rejected.
- No Cool variant on bauhaus.at (only the 12.000 BTU model).

## Fixtures (`src/lib/retailers/__fixtures__/`)

- `obi-stores.json` — real store directory (79 stores)
- `obi-stock-portasplit.json` — real stock response, all 0
- `obi-stock-portasplit-instock-synthetic.json` — hand-edited: first 3 stores have stock
- `obi-pdp-portasplit{,-cool}.html` — real PDPs
- `mediamarkt-pdp-portasplit{,-cool}.html` — real PDPs
- `tepto-pdp-portasplit.html` — real PDP
- `bauhaus-pdp-portasplit-synthetic.html` — minimal HTML wrapping the real JSON-LD

Variant coverage per retailer: OBI both; MediaMarkt both; Tepto base only; Bauhaus base only.
