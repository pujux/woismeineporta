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

// Amazon rate-challenges scrapers: after a few rapid requests it serves a CAPTCHA/
// robot page instead of the PDP. We pace the per-ASIN fetches with jitter and retry
// once (after a pause) when we detect a blocked page — no delays under test.
const isTest = process.env.NODE_ENV === "test";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const paceMs = () => (isTest ? 0 : 400 + Math.floor(Math.random() * 500));
const retryDelayMs = () => (isTest ? 0 : 1500 + Math.floor(Math.random() * 1500));

/** A CAPTCHA / robot-check / interstitial page rather than a real PDP. */
export function isBlockedPage(html: string): boolean {
  if (/captcha|automated access|api-services-support@amazon|enter the characters you see below/i.test(html)) return true;
  // Real PDPs are ~1–3 MB and contain the product title; a tiny page without it is a block.
  return !html.includes('id="productTitle"') && html.length < 20000;
}

// Fetches a PDP; if the response looks like a bot challenge, waits and retries once.
async function fetchAmazonHtml(fetchFn: typeof fetch, asin: string): Promise<string> {
  const url = `${productUrl(asin)}?language=de_DE`; // force German markup regardless of egress geo
  const opts = { headers: { Accept: "text/html", "Accept-Language": "de-AT,de;q=0.9" } };
  let html = await (await politeFetch(url, opts, fetchFn)).text();
  if (isBlockedPage(html)) {
    await sleep(retryDelayMs());
    html = await (await politeFetch(url, opts, fetchFn)).text();
  }
  return html;
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
    let firstFetch = true;
    for (const product of PRODUCTS) {
      const perColour: Array<{ asin: string; priceCents: number | null; inStock: boolean }> = [];
      for (const asin of product.asins) {
        if (!firstFetch) await sleep(paceMs()); // space requests so we don't trip the rate challenge
        firstFetch = false;
        const { status, priceCents } = parseAmazon(await fetchAmazonHtml(fetchFn, asin));
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
