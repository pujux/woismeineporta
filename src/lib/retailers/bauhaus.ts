import { fetchBauhausOnlineStock, fetchBauhausPrice, fetchBauhausStoreStock } from "./bauhaus-stores";
import { politeFetch } from "./fetch";
import { parseProductLd } from "./jsonld";
import type { RetailerAdapter, StockStatus, StoreStock } from "./types";

const URL = "https://www.bauhaus.at/klimaanlagen/midea-klimasplitgeraet-portasplit-12000-btu/p/31934233";

// Both the online status AND the per-store stock come from api.bauhaus (a separate
// Apigee host that authenticates with just the public apiKey + an allowed Origin —
// NOT behind Cloudflare, so it stays reachable even from a flagged/datacenter IP):
//   • online    → /v1/product-stock/at/products/{id}/stock          (no warehouse)
//   • per store → /v1/product-stock/at/products/{id}/warehouses/{fc}/stock
//
// The Cloudflare-protected PDP is only needed to discover the public apiKey and the
// price. Set BAUHAUS_API_KEY (the `apiKey:"…"` value from the PDP source) to skip the
// PDP entirely when it's 403'd from the server — availability still works, only the
// price is then unavailable.
export const bauhausAdapter: RetailerAdapter = {
  slug: "bauhaus",
  tier: "slow",
  async check(fetchFn) {
    const envKey = process.env.BAUHAUS_API_KEY;
    let apiKey = envKey;
    let priceCents: number | null = null;
    let pdpStatus: StockStatus | null = null;

    // Without a configured key, scrape the PDP for the public apiKey + price. From a
    // flagged IP this 403s (AdapterHttpError propagates) — then set BAUHAUS_API_KEY.
    if (!envKey) {
      const res = await politeFetch(URL, { headers: { Accept: "text/html" } }, fetchFn);
      const html = await res.text();
      const ld = parseProductLd(html);
      if (ld) {
        priceCents = ld.priceCents;
        pdpStatus = ld.status;
      }
      apiKey = html.match(/apiKey:\s*"([A-Za-z0-9]+)"/)?.[1];
    }

    if (!apiKey) throw new Error("bauhaus: no apiKey — PDP blocked; set BAUHAUS_API_KEY");

    // api.bauhaus is authoritative for real-time availability; the PDP JSON-LD status
    // is only a fallback for when the online-stock call itself fails.
    const online = await fetchBauhausOnlineStock(fetchFn, apiKey).catch((err) => {
      console.error("bauhaus: online-stock check failed:", err);
      return null;
    });

    let storeStock: StoreStock[] | null = null;
    try {
      storeStock = await fetchBauhausStoreStock(fetchFn, apiKey);
    } catch (err) {
      console.error("bauhaus: store-stock sweep failed:", err);
    }

    // Both api.bauhaus calls failed (e.g. apiKey rotated) → surface a real error so the
    // poller backs off / marks unknown rather than reporting a bogus "out of stock".
    if (online == null && !storeStock) {
      throw new Error("bauhaus: api.bauhaus unreachable — online + store sweep both failed (check BAUHAUS_API_KEY)");
    }

    // Price: from the PDP JSON-LD when we fetched it; otherwise (env-key mode, PDP
    // skipped) best-effort via the api.bauhaus recommendation widget — Cloudflare-free.
    // Availability never depends on it, so a miss just leaves the price blank.
    if (priceCents == null) {
      priceCents = await fetchBauhausPrice(fetchFn, apiKey).catch((err) => {
        console.error("bauhaus: price lookup failed:", err);
        return null;
      });
    }

    const status: StockStatus =
      online != null ? (online ? "in_stock" : "out_of_stock") : (pdpStatus ?? "unknown");

    return {
      retailerSlug: "bauhaus",
      offers: [{ variant: "portasplit", url: URL, priceCents, status }],
      storeStock,
    };
  },
};
