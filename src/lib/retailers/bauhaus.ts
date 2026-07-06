import { politeFetch } from "./fetch";
import { parseProductLd } from "./jsonld";
import type { RetailerAdapter } from "./types";

const URL =
  "https://www.bauhaus.at/klimaanlagen/midea-klimasplitgeraet-portasplit-12000-btu/p/31934233";

// bauhaus.at sits behind Cloudflare bot management: server-side requests get a
// 403 challenge (see docs/retailers.md). This adapter therefore usually throws
// AdapterHttpError(403) and the poller reports the retailer as "unknown". If the
// protection is ever relaxed, the JSON-LD parser takes over automatically.
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
