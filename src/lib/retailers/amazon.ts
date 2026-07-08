import { politeFetch } from "./fetch";
import type { OnlineOffer, RetailerAdapter, StockStatus, VariantSlug } from "./types";

const PRODUCTS: Array<{ variant: VariantSlug; asin: string; url: string }> = [
  // PortaSplit-E, 12.000 BTU, Kühlen + Heizen
  { variant: "portasplit", asin: "B0GX16LKSC", url: "https://www.amazon.de/dp/B0GX16LKSC" },
  // PortaSplit Cool, 8.000 BTU, nur Kühlung
  { variant: "portasplit-cool", asin: "B0GXDWTFR5", url: "https://www.amazon.de/dp/B0GXDWTFR5" },
];

// "1.234,56 €" / "40,33€" → 123456 / 4033 (cents). German number formatting.
export function parseEuroCents(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/);
  if (!m) return null;
  const euros = Number(m[1].replace(/\./g, "")) + Number(m[2]) / 100;
  return Number.isFinite(euros) ? Math.round(euros * 100) : null;
}

/**
 * Amazon.de exposes availability via the "featured offer" (buy box): an
 * `add-to-cart-button` means the product is buyable at the buy-box price. We
 * deliberately IGNORE the "other sellers"/marketplace listings — for this product
 * those are only inflated "Collectible – Like New" resellers (~€1.800 vs ~€750 retail),
 * which must NOT count as available (they'd fire a misleading restock alert). Amazon's
 * own "No featured offers available" string is unreliable (it's present even on in-stock
 * pages, in a hidden widget), so the add-to-cart button is the signal.
 */
export function parseAmazon(html: string): { status: StockStatus; priceCents: number | null } {
  // A CAPTCHA / robot-check page has no productTitle — treat as blocked (throw), NOT as
  // out_of_stock, so the poller backs off instead of reporting bogus availability.
  if (!html.includes('id="productTitle"')) {
    throw new Error("amazon: no productTitle (blocked, CAPTCHA, or layout change)");
  }

  if (!html.includes('id="add-to-cart-button"')) return { status: "out_of_stock", priceCents: null };

  // Buy-box price = first a-offscreen inside the core-price feature block.
  const region = html.match(/id="corePrice(?:Display_desktop)?_feature_div"[\s\S]{0,2500}/)?.[0] ?? "";
  const price = region.match(/class="a-offscreen">([^<]+)</)?.[1];
  return { status: "in_stock", priceCents: parseEuroCents(price) };
}

// amazon.at is a marginal storefront; Austrian shoppers use amazon.de. The product is
// only ever offered by third-party resellers there (never Amazon first-party), so this
// mostly sits at out_of_stock — but it will catch a genuine featured offer if one appears.
export const amazonAdapter: RetailerAdapter = {
  slug: "amazon",
  tier: "slow",
  async check(fetchFn) {
    const offers: OnlineOffer[] = [];
    for (const product of PRODUCTS) {
      // language=de_DE forces German markup regardless of the egress IP's geo.
      const res = await politeFetch(
        `${product.url}?language=de_DE`,
        { headers: { Accept: "text/html", "Accept-Language": "de-AT,de;q=0.9" } },
        fetchFn,
      );
      const { status, priceCents } = parseAmazon(await res.text());
      offers.push({ variant: product.variant, url: product.url, priceCents, status });
    }
    return { retailerSlug: "amazon", offers, storeStock: null };
  },
};
