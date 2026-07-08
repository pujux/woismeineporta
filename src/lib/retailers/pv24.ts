import { politeFetch } from "./fetch";
import type { OnlineOffer, RetailerAdapter } from "./types";

// PV-24 (PV-24 GmbH, Tyrol) runs WordPress/WooCommerce, whose public Store API returns
// clean product JSON — stock flag + price in the currency's minor unit — so no HTML
// scraping. Product 33944 = the 12.000 BTU PortaSplit (heat+cool); PV-24 doesn't list Cool.
const PRODUCT_ID = 33944;
const API_URL = `https://www.pv-24.at/wp-json/wc/store/v1/products/${PRODUCT_ID}`;
const PAGE_URL = "https://www.pv-24.at/products/midea-porta-split-mobile-klimaanlage-mit-ausseneinheit/";

interface WooProduct {
  is_in_stock?: boolean;
  prices?: { price?: string; currency_minor_unit?: number };
  permalink?: string;
}

// WooCommerce Store API prices are integer strings in the currency's minor unit
// (e.g. "108900" with minor_unit 2 = €1.089,00 → 108900 cents).
export function parseWooCents(prices: WooProduct["prices"]): number | null {
  const raw = prices?.price;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const minor = prices?.currency_minor_unit ?? 2;
  return Math.round((n / 10 ** minor) * 100);
}

export const pv24Adapter: RetailerAdapter = {
  slug: "pv24",
  tier: "slow",
  async check(fetchFn) {
    const res = await politeFetch(API_URL, { headers: { Accept: "application/json" } }, fetchFn);
    const p = (await res.json()) as WooProduct;
    if (typeof p.is_in_stock !== "boolean") throw new Error("pv24: unexpected WooCommerce payload");
    const offer: OnlineOffer = {
      variant: "portasplit",
      url: p.permalink ?? PAGE_URL,
      priceCents: parseWooCents(p.prices),
      status: p.is_in_stock ? "in_stock" : "out_of_stock",
    };
    return { retailerSlug: "pv24", offers: [offer], storeStock: null };
  },
};
