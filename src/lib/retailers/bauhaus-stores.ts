import bauhausStores from "@/data/bauhaus-stores.json";
import { plzToLatLng } from "@/lib/geo";
import { AdapterHttpError, politeFetch } from "./fetch";
import type { StoreStock, VariantSlug } from "./types";

interface Fachcentrum {
  id: string;
  name: string;
  zip: string;
  city: string;
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
  return /IN_STOCK|LOW_STOCK|LIMITED|AVAILABLE/i.test(level);
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
      const geo = plzToLatLng(fc.zip);
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
