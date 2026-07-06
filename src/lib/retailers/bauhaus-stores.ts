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

// Bauhaus product ids per variant (only the 12.000-BTU PortaSplit is listed).
const PRODUCTS: Array<{ variant: VariantSlug; productId: string }> = [
  { variant: "portasplit", productId: "31934233" },
];

const API_BASE = "https://api.bauhaus";

/**
 * Per-warehouse stock endpoint discovered in the PDP config:
 *   /v1/product-stock/{country-code}/products/{product-id}/warehouses/{warehouse-id}/stock
 * The response SHAPE is not yet verified against a live 200 (the endpoint 401s
 * without a token). `parseStock` is written defensively against the fields
 * these Apigee stock services typically return; confirm and tighten once a real
 * response is captured.
 */
function stockUrl(productId: string, warehouseId: string): string {
  return `${API_BASE}/v1/product-stock/at/products/${productId}/warehouses/${warehouseId}/stock`;
}

export function parseStock(body: unknown): boolean {
  if (body == null || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  const qty =
    (typeof o.availableQuantity === "number" && o.availableQuantity) ||
    (typeof o.stockLevel === "number" && o.stockLevel) ||
    (typeof o.quantity === "number" && o.quantity) ||
    0;
  if (qty > 0) return true;
  if (typeof o.available === "boolean") return o.available;
  if (typeof o.inStock === "boolean") return o.inStock;
  return false;
}

/**
 * Queries every Austrian Fachcentrum for the given token and returns per-store
 * availability. Throws AdapterHttpError(401) if the token is rejected so the
 * caller can trigger a refresh. Individual store errors are swallowed (that
 * store is simply omitted) rather than failing the whole sweep.
 */
export async function fetchBauhausStoreStock(
  fetchFn: typeof fetch,
  token: string,
): Promise<StoreStock[]> {
  const auth = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const out: StoreStock[] = [];

  for (const product of PRODUCTS) {
    for (const fc of STORES) {
      const geo = plzToLatLng(fc.zip);
      if (!geo) continue;
      let res: Response;
      try {
        res = await politeFetch(stockUrl(product.productId, fc.id), { headers: auth }, fetchFn);
      } catch (err) {
        // A 401 means the token is dead — surface it so the caller refreshes.
        if (err instanceof AdapterHttpError && err.status === 401) throw err;
        continue; // transient/other error for this store: skip it
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
