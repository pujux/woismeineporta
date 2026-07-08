import bauhausStores from "@/data/bauhaus-stores.json";
import { plzToLatLng } from "@/lib/geo";
import { AdapterHttpError, politeFetch } from "./fetch";
import type { StoreStock, VariantSlug } from "./types";

interface Fachcentrum {
  id: string;
  name: string;
  zip: string;
  city: string;
  /** Exact store coordinates harvested from the Fachcentrum page. */
  lat?: number;
  lon?: number;
}

const STORES = bauhausStores as Fachcentrum[];

// Only the 12.000-BTU PortaSplit is listed on bauhaus.at.
const PRODUCTS: Array<{ variant: VariantSlug; productId: string }> = [
  { variant: "portasplit", productId: "31934233" },
];

const API_BASE = "https://api.bauhaus";

// api.bauhaus authenticates with the public Apigee apiKey embedded in the PDP
// (plus an allowed Origin/Referer). No OAuth token or browser needed.
function apiHeaders(apiKey: string): Record<string, string> {
  return {
    apikey: apiKey,
    Accept: "application/json",
    Origin: "https://www.bauhaus.at",
    Referer: "https://www.bauhaus.at/",
  };
}

function stockUrl(productId: string, warehouseId: string): string {
  return `${API_BASE}/v1/product-stock/at/products/${productId}/warehouses/${warehouseId}/stock`;
}

// Same product-stock endpoint WITHOUT a warehouse segment returns the online
// (webshop/central) stock. Verified 2026-07-08 to track the PDP `deliverable`
// flag exactly (amount>0 ⇔ deliverable=1) across in- and out-of-stock products —
// so it's the online orderability signal, reachable without the Cloudflare PDP.
function onlineStockUrl(productId: string): string {
  return `${API_BASE}/v1/product-stock/at/products/${productId}/stock`;
}

/**
 * Live response shape (verified 2026-07-06):
 *   { "amount": 0, "availibility_level": "OUT_OF_STOCK" }   // sic: "availibility"
 * `amount` is authoritative; the level string is a fallback. Only OUT_OF_STOCK
 * was observable (product sold out everywhere) — the positive levels are matched
 * generously so a restock is never missed.
 */
export function parseStock(body: unknown): boolean {
  if (body == null || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  if (typeof o.amount === "number" && o.amount > 0) return true;
  const level = typeof o.availibility_level === "string" ? o.availibility_level : "";
  return /IN_STOCK|LOW_STOCK|LIMITED|AVAILABLE|MANY|SOME/i.test(level);
}

/**
 * Online (webshop) availability for the PortaSplit from api.bauhaus — same auth as
 * the per-store sweep, no PDP/Cloudflare. Throws on 401/403 (apiKey rejected/rotated)
 * so the adapter can degrade; other errors propagate to the caller's catch.
 */
export async function fetchBauhausOnlineStock(fetchFn: typeof fetch, apiKey: string): Promise<boolean> {
  const res = await politeFetch(onlineStockUrl(PRODUCTS[0].productId), { headers: apiHeaders(apiKey) }, fetchFn);
  return parseStock(await res.json());
}

// The Bloomreach recommendation widget — the only api.bauhaus endpoint reachable with
// the public apiKey that carries `priceInfo`. Returns a list of related products.
function recommendationUrl(seedProductId: string): string {
  return `${API_BASE}/v1/product-recommendation/4/at/webshop/product-detail-page?product-id=${seedProductId}&visitor-id=x&referrer-url=`;
}

interface DiscoveryResult {
  id?: string;
  metadata?: { product?: { priceInfo?: { price?: number | null } } };
}

async function fetchRecommendations(
  fetchFn: typeof fetch,
  apiKey: string,
  seedProductId: string,
): Promise<DiscoveryResult[]> {
  const res = await politeFetch(recommendationUrl(seedProductId), { headers: apiHeaders(apiKey) }, fetchFn);
  const body = (await res.json()) as unknown;
  const root = Array.isArray(body) ? body[0] : body;
  const results = (root as { results?: unknown } | null)?.results;
  return Array.isArray(results) ? (results as DiscoveryResult[]) : [];
}

/**
 * Bauhaus's price/masterdata endpoints need OAuth — the public apiKey can't read a
 * product's own price directly. But the recommendation widget returns full `priceInfo`
 * for every product it lists, and while a product never appears in its OWN
 * recommendations, its accessories cross-recommend back to it. So: seed the widget with
 * the PortaSplit's own top recommendations (its accessories) and read the price off the
 * back-reference. Self-bootstrapping (no hardcoded accessory id) and best-effort —
 * returns null if the product doesn't surface (recommendations are dynamic).
 */
export async function fetchBauhausPrice(fetchFn: typeof fetch, apiKey: string): Promise<number | null> {
  const productId = PRODUCTS[0].productId;
  const related = await fetchRecommendations(fetchFn, apiKey, productId);
  for (const seed of related.slice(0, 3)) {
    if (!seed.id || seed.id === productId) continue;
    const back = await fetchRecommendations(fetchFn, apiKey, seed.id);
    const price = back.find((p) => p.id === productId)?.metadata?.product?.priceInfo?.price;
    if (typeof price === "number") return Math.round(price * 100);
  }
  return null;
}

/**
 * Queries every Austrian Fachcentrum and returns per-store availability.
 * Individual store errors are skipped (that store is omitted); a 401/403 —
 * meaning the apiKey was rejected/rotated — is thrown so the caller can fall
 * back to online-only.
 */
export async function fetchBauhausStoreStock(
  fetchFn: typeof fetch,
  apiKey: string,
): Promise<StoreStock[]> {
  const headers = apiHeaders(apiKey);
  const out: StoreStock[] = [];

  for (const product of PRODUCTS) {
    for (const fc of STORES) {
      // Exact store coordinates from the Fachcentrum page; ZIP centroid only as
      // a fallback for the rare store that doesn't publish them.
      const geo =
        fc.lat != null && fc.lon != null ? { lat: fc.lat, lng: fc.lon } : plzToLatLng(fc.zip);
      if (!geo) continue;
      let res: Response;
      try {
        res = await politeFetch(stockUrl(product.productId, fc.id), { headers }, fetchFn);
      } catch (err) {
        if (err instanceof AdapterHttpError && (err.status === 401 || err.status === 403)) throw err;
        continue; // transient error for this store: skip it
      }
      out.push({
        store: {
          externalId: fc.id,
          name: fc.name,
          zip: fc.zip,
          city: fc.city,
          lat: geo.lat,
          lng: geo.lng,
        },
        variant: product.variant,
        inStock: parseStock(await res.json()),
      });
    }
  }

  return out;
}
