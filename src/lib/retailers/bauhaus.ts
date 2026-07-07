import { fetchBauhausStoreStock } from "./bauhaus-stores";
import { politeFetch } from "./fetch";
import { parseProductLd, type LdOffer } from "./jsonld";
import type { RetailerAdapter, StoreStock } from "./types";

const URL = "https://www.bauhaus.at/klimaanlagen/midea-klimasplitgeraet-portasplit-12000-btu/p/31934233";

// bauhaus.at sits behind Cloudflare bot management. Normally the poller fetches the
// PDP through impit (Chrome TLS impersonation), which clears it — so we scrape the
// online status + the public Apigee apiKey, then sweep per-store stock from
// api.bauhaus (a separate host that authenticates with just that apiKey + Origin).
//
// From a flagged/datacenter IP the PDP gets 403'd even via impit — but api.bauhaus
// itself stays reachable. So if BAUHAUS_API_KEY is set, we SKIP the PDP entirely and
// go straight to api.bauhaus for per-store stock (online status is then "unknown").
// The key is a public value from the PDP source (`apiKey:"…"`).
export const bauhausAdapter: RetailerAdapter = {
  slug: "bauhaus",
  tier: "slow",
  async check(fetchFn) {
    const envKey = process.env.BAUHAUS_API_KEY;
    let ld: LdOffer | null = null;
    let apiKey = envKey;

    if (!envKey) {
      const res = await politeFetch(URL, { headers: { Accept: "text/html" } }, fetchFn);
      const html = await res.text();
      ld = parseProductLd(html);
      if (!ld) throw new Error("bauhaus: no product JSON-LD");
      apiKey = html.match(/apiKey:\s*"([A-Za-z0-9]+)"/)?.[1];
    }

    let storeStock: StoreStock[] | null = null;
    if (apiKey) {
      try {
        storeStock = await fetchBauhausStoreStock(fetchFn, apiKey);
      } catch (err) {
        console.error("bauhaus: store-stock sweep failed:", err);
      }
    }

    // Nothing usable (PDP blocked AND store sweep failed) → surface a real error.
    if (!ld && !storeStock) {
      throw new Error("bauhaus: no data — PDP blocked and store sweep failed (check BAUHAUS_API_KEY)");
    }

    const offer = ld
      ? { variant: "portasplit" as const, url: URL, ...ld }
      : { variant: "portasplit" as const, url: URL, priceCents: null, status: "unknown" as const };

    return { retailerSlug: "bauhaus", offers: [offer], storeStock };
  },
};
