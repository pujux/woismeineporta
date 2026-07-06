import { politeFetch } from "./fetch";
import { parseProductLd } from "./jsonld";
import type { RetailerAdapter } from "./types";

const URL = "https://www.bauhaus.at/klimaanlagen/midea-klimasplitgeraet-portasplit-12000-btu/p/31934233";

// bauhaus.at sits behind Cloudflare bot management. The poller fetches through
// impit (Chrome TLS impersonation, see impit-fetch.ts), which clears the
// challenge and returns the real PDP — so online status/price parse normally.
// Store-level ("Fachcentrum") data would need an OAuth token against api.bauhaus
// and is not covered. If Cloudflare ever tightens again, this throws
// AdapterHttpError(403) and the poller degrades the retailer to "unknown".
export const bauhausAdapter: RetailerAdapter = {
  slug: "bauhaus",
  tier: "slow",
  async check(fetchFn) {
    const res = await politeFetch(URL, { headers: { Accept: "text/html" } }, fetchFn);
    const ld = parseProductLd(await res.text());
    if (!ld) throw new Error("bauhaus: no product JSON-LD");
    return {
      retailerSlug: "bauhaus",
      // Only the base PortaSplit is listed on bauhaus.at.
      offers: [{ variant: "portasplit", url: URL, ...ld }],
      storeStock: null,
    };
  },
};
