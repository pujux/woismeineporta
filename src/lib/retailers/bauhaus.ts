import { fetchBauhausStoreStock } from "./bauhaus-stores";
import { politeFetch } from "./fetch";
import { parseProductLd } from "./jsonld";
import type { RetailerAdapter, StoreStock } from "./types";

const URL = "https://www.bauhaus.at/klimaanlagen/midea-klimasplitgeraet-portasplit-12000-btu/p/31934233";

// bauhaus.at sits behind Cloudflare bot management; the poller fetches through
// impit (Chrome TLS impersonation), which clears it and returns the real PDP —
// so online status/price parse normally.
//
// Store-level ("Fachcentrum") stock comes from api.bauhaus, which authenticates
// with the public Apigee apiKey embedded in that same PDP (plus an allowed
// Origin) — no OAuth token or browser needed. We extract the key and sweep all
// Austrian Fachcentren; if the key is missing or rejected, storeStock stays null
// and the retailer degrades to online-status-only.
export const bauhausAdapter: RetailerAdapter = {
  slug: "bauhaus",
  tier: "slow",
  async check(fetchFn) {
    const res = await politeFetch(URL, { headers: { Accept: "text/html" } }, fetchFn);
    const html = await res.text();
    const ld = parseProductLd(html);
    if (!ld) throw new Error("bauhaus: no product JSON-LD");

    let storeStock: StoreStock[] | null = null;
    const apiKey = html.match(/apiKey:\s*"([A-Za-z0-9]+)"/)?.[1];
    if (apiKey) {
      try {
        storeStock = await fetchBauhausStoreStock(fetchFn, apiKey);
      } catch (err) {
        console.error("bauhaus: store-stock sweep failed:", err);
        storeStock = null;
      }
    }

    return {
      retailerSlug: "bauhaus",
      offers: [{ variant: "portasplit", url: URL, ...ld }],
      storeStock,
    };
  },
};
