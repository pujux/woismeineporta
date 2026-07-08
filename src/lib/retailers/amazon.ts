import { politeFetch } from "./fetch";
import type { OnlineOffer, RetailerAdapter, StockStatus, VariantSlug } from "./types";

// A variant can map to several ASINs — Amazon lists the same product per colour. The
// colour is irrelevant to "is the PortaSplit buyable", so we track all of them and treat
// the variant as available if ANY colour has a featured offer.
const PRODUCTS: Array<{ variant: VariantSlug; asins: string[] }> = [
  // 12.000 BTU PortaSplit-E (Kühlen + Heizen) — Pfirsich + Grau.
  { variant: "portasplit", asins: ["B0GX16LKSC", "B0D3PP64JS"] },
  // 8.000 BTU PortaSplit Cool (nur Kühlung) — single colour.
  { variant: "portasplit-cool", asins: ["B0GXDWTFR5"] },
];

function productUrl(asin: string): string {
  return `https://www.amazon.de/dp/${asin}`;
}

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
      const perColour: Array<{ asin: string; priceCents: number | null; inStock: boolean }> = [];
      for (const asin of product.asins) {
        // language=de_DE forces German markup regardless of the egress IP's geo.
        const res = await politeFetch(
          `${productUrl(asin)}?language=de_DE`,
          { headers: { Accept: "text/html", "Accept-Language": "de-AT,de;q=0.9" } },
          fetchFn,
        );
        const { status, priceCents } = parseAmazon(await res.text());
        perColour.push({ asin, priceCents, inStock: status === "in_stock" });
      }
      // Available if any colour is buyable; link + price from the cheapest in-stock colour,
      // else fall back to the primary colour's link (out of stock, no price).
      const cheapest = perColour
        .filter((c) => c.inStock)
        .sort((a, b) => (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity))[0];
      offers.push({
        variant: product.variant,
        url: productUrl(cheapest?.asin ?? product.asins[0]),
        priceCents: cheapest?.priceCents ?? null,
        status: cheapest ? "in_stock" : "out_of_stock",
      });
    }
    return { retailerSlug: "amazon", offers, storeStock: null };
  },
};
