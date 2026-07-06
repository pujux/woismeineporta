import { politeFetch } from "./fetch";
import { parseProductLd } from "./jsonld";
import type { RetailerAdapter } from "./types";

const URL = "https://www.tepto.at/Midea-Klimageraet-PortaSplit";

export const teptoAdapter: RetailerAdapter = {
  slug: "tepto",
  tier: "slow",
  async check(fetchFn) {
    const res = await politeFetch(URL, { headers: { Accept: "text/html" } }, fetchFn);
    const ld = parseProductLd(await res.text());
    if (!ld) throw new Error("tepto: no product JSON-LD");
    return {
      retailerSlug: "tepto",
      // Tepto only lists the base PortaSplit (no Cool variant in their range).
      offers: [{ variant: "portasplit", url: URL, ...ld }],
      storeStock: null,
    };
  },
};
