import { fetchBauhausStoreStock } from "./bauhaus-stores";
import { getBauhausToken } from "./bauhaus-token";
import { politeFetch } from "./fetch";
import { parseProductLd } from "./jsonld";
import type { RetailerAdapter, StoreStock } from "./types";

const URL = "https://www.bauhaus.at/klimaanlagen/midea-klimasplitgeraet-portasplit-12000-btu/p/31934233";

// bauhaus.at sits behind Cloudflare bot management. The poller fetches through
// impit (Chrome TLS impersonation, see impit-fetch.ts), which clears the
// challenge and returns the real PDP — so online status/price parse normally.
//
// Store-level ("Fachcentrum") data comes from api.bauhaus and needs an Apigee
// OAuth token (see bauhaus-token.ts). When a token is available we sweep all
// Austrian Fachcentren; otherwise storeStock stays null and the retailer is
// online-status-only, exactly as before.
export const bauhausAdapter: RetailerAdapter = {
  slug: "bauhaus",
  tier: "slow",
  async check(fetchFn) {
    const res = await politeFetch(URL, { headers: { Accept: "text/html" } }, fetchFn);
    const ld = parseProductLd(await res.text());
    if (!ld) throw new Error("bauhaus: no product JSON-LD");

    let storeStock: StoreStock[] | null = null;
    const token = await getBauhausToken();
    if (token) {
      try {
        storeStock = await fetchBauhausStoreStock(fetchFn, token);
      } catch (err) {
        // Token rejected/expired or the API is unreachable — fall back to
        // online-only rather than failing the whole retailer.
        console.error("bauhaus: store-stock sweep failed:", err);
        storeStock = null;
      }
    }

    return {
      retailerSlug: "bauhaus",
      // Only the base PortaSplit is listed on bauhaus.at.
      offers: [{ variant: "portasplit", url: URL, ...ld }],
      storeStock,
    };
  },
};
