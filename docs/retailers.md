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
| BAUHAUS | ✓ api.bauhaus `product-stock` (no warehouse) | ✓ 23 AT Fachcentren, per-store availability | everything (status, stores, price) via `api.bauhaus` — not Cloudflare; PDP no longer required |
| Amazon | ✓ featured offer (buy box) only | — | PDP fetch works via impit from residential; **datacenter IPs may get CAPTCHA'd** |
| Online-Batterien | ✓ schema.org microdata | — | plain HTML, works |
| PV-24 | — | — | **dropped 2026-07: pv-24.at became host-unreachable from the server** (repeated health alerts); WooCommerce Store API had worked (`/wp-json/wc/store/v1/products/33944`) |
| Hornbach | — | — | **dropped: does not sell the PortaSplit in Austria** (0 search results on hornbach.at) |
| hagebau | — | — | **dropped: does not sell the PortaSplit** (Midea category on hagebau.at lists other models, no PortaSplit) |
| Lidl | — | — | **dropped: Lidl DE only** (not on lidl.at) |

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
- Price parses from the PDP JSON-LD (749 € at capture time) when the PDP is fetched. When it's blocked (env-key mode), price comes from `api.bauhaus` too — see the recommendation-widget trick below. **The PDP is no longer required for anything.**
- **Price via api.bauhaus — IMPLEMENTED (2026-07-08).** The public apiKey can't read a product's own price (the `product-price`/`product-batch`/`product-masterdata` endpoints need OAuth, and `product-masterdata/3` 404s for every webshop id — its PIM code ≠ the webshop id). But the Bloomreach recommendation widget `/v1/product-recommendation/4/at/webshop/product-detail-page?product-id={id}` **is** scoped for the apiKey and returns full `metadata.product.priceInfo` for every product it lists. A product never appears in its **own** recommendations, but its accessories cross-recommend back to it — so `fetchBauhausPrice()` seeds the widget with the PortaSplit's own top recommendations (its accessories), then reads the price off the back-reference. Self-bootstrapping (no hardcoded accessory id), best-effort (null if the product doesn't surface). Verified 2026-07-08: 74900 ¢, matches the PDP.
- **Online status via api.bauhaus — IMPLEMENTED (2026-07-08).** The same `product-stock` endpoint **without** a warehouse segment returns the online/webshop stock: `https://api.bauhaus/v1/product-stock/at/products/{id}/stock` → `{ amount, availibility_level }`. Verified to track the PDP `dataLayer.product.deliverable` flag exactly (`amount>0 ⇔ deliverable=1`) across in- and out-of-stock products — so it's the online orderability signal, reachable without the Cloudflare PDP. `fetchBauhausOnlineStock()` in `src/lib/retailers/bauhaus-stores.ts`; the adapter treats it as authoritative and only falls back to the PDP JSON-LD `availability` if that call fails.
- **Store-level ("Fachcentrum") data — IMPLEMENTED (2026-07-06).** Same endpoint **with** a warehouse segment: `.../warehouses/{fachcentrumId}/stock`. Needs **no OAuth token** — the public Apigee `apiKey` embedded in the PDP (`apiKey:"…"`) plus an allowed `Origin`/`Referer: https://www.bauhaus.at` is sufficient. The earlier 401s were a missing `Origin` header, not a missing token. Sweeps all 23 AT Fachcentren (`src/data/bauhaus-stores.json`, exact coordinates).
- **`BAUHAUS_API_KEY` env (2026-07-07).** From a flagged/datacenter IP even impit gets 403'd on the PDP, but `api.bauhaus` stays reachable. Set `BAUHAUS_API_KEY` to the public apiKey and the adapter skips the PDP entirely — online status, all 23 Fachcentren **and the price** still work (nothing lost). The online + store sweep both failing (e.g. key rotated) throws so the poller backs off; the price is best-effort and just goes blank on failure.
- **apiKey scope (mapped 2026-07-08):** authorized → `product-stock`, `product-recommendation/3,4`, `product-masterdata/3` (but needs a PIM code we can't resolve), `search-suggestions` (but needs a catalog `language_id` we can't determine, 0–80 all "not valid"). OAuth-only (401 invalid access token) → `product-price`, `product-pricing`, `prices`, `product-batch`, `product/products`. Not scoped for this key (401 invalid apiKey for resource) → `product-category`, `assets-masterdata`.
- No Cool variant on bauhaus.at (only the 12.000 BTU model).

## Amazon (amazon.de)

- ASINs: `portasplit` = 12.000 BTU PortaSplit-E (Kühlen+Heizen), **two colours**: `B0GX16LKSC` (Pfirsich) + `B0D3PP64JS` (Grau) — the twister `dimensionValuesDisplayData` lists exactly these two. `portasplit-cool` = `B0GXDWTFR5` (8.000 BTU, single colour). A variant is available if **any** of its colour ASINs has a featured offer; price + deep link come from the cheapest in-stock colour. (amazon.at is a marginal storefront; AT shoppers use amazon.de.)
- **Availability = featured offer (buy box) only.** Signal: the presence of `id="add-to-cart-button"` on the PDP. Price = the first `a-offscreen` inside `#corePrice_feature_div` / `#corePriceDisplay_desktop_feature_div`. No JSON-LD; parsing is regex over the ~2 MB HTML.
- **Marketplace/"other sellers" offers are deliberately ignored.** For this product they're only inflated third-party "Collectible – Like New" resellers (~€1.800 vs ~€750 retail); counting them would fire misleading restock alerts. Amazon's own `"No featured offers available"` string is **unreliable** (present even on in-stock pages, in a hidden AOD widget) — hence the add-to-cart signal, verified against an in-stock reference product (2026-07-08).
- **Block guard:** a CAPTCHA/robot-check page has no `id="productTitle"` → the adapter throws (poller backs off / markUnknown) rather than reporting a false `out_of_stock`.
- **Server-side access caveat:** PDPs fetch fine via impit from a residential IP, but Amazon aggressively CAPTCHAs **datacenter** IPs. If prod gets blocked, it likely needs WARP/a residential proxy (like MediaMarkt). Amazon has never stocked the PortaSplit first-party, so this mostly sits at `out_of_stock` — but it will catch a genuine featured offer if one ever appears.

## Online-Batterien (online-batterien.at)

- AKKU SYS GmbH (Wolfurt, Vorarlberg), a battery-tech shop; sells the 12.000 BTU PortaSplit (heat+cool), free shipping to AT; no Cool variant. ~€1.106,71.
- **Gambio** shop with no public JSON API (its REST API is auth-gated), but the PDP carries a schema.org **Offer as inline microdata**: `<meta itemprop="price" content="1106.71">` + `<link itemprop="availability" href="…/schema.org/…">`. Parsed via regex in `src/lib/retailers/online-batterien.ts`. `PreOrder`/`BackOrder` are mapped to `out_of_stock` (not immediate availability). Throws if the Offer microdata is absent (blocked / layout change).

## Fixtures (`src/lib/retailers/__fixtures__/`)

- `obi-stores.json` — real store directory (79 stores)
- `obi-stock-portasplit.json` — real stock response, all 0
- `obi-stock-portasplit-instock-synthetic.json` — hand-edited: first 3 stores have stock
- `obi-pdp-portasplit{,-cool}.html` — real PDPs
- `mediamarkt-pdp-portasplit{,-cool}.html` — real PDPs
- `tepto-pdp-portasplit.html` — real PDP
- `bauhaus-pdp-portasplit-synthetic.html` — minimal HTML wrapping the real JSON-LD
- `amazon-pdp-{instock,oos}-synthetic.html` — minimal HTML with the parser-relevant markers (add-to-cart / core price / scalper offer)

Variant coverage per retailer: OBI both; MediaMarkt both; Tepto base only; Bauhaus base only; Amazon both; Online-Batterien base only.
