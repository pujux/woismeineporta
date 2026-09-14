import { politeFetch } from "./fetch";
import { parseProductLd } from "./jsonld";
import type { OnlineOffer, RetailerAdapter, StockStatus, VariantSlug } from "./types";

const PRODUCTS: Array<{ variant: VariantSlug; productId: string; url: string }> = [
  {
    variant: "portasplit",
    productId: "2075674",
    url: "https://www.mediamarkt.at/de/product/_midea-portasplit-mobile-klimaanlage-max-raumgrosse-42-m-eek-a-12000-btuh-weiss-2075674.html",
  },
  {
    variant: "portasplit-cool",
    productId: "2080923",
    url: "https://www.mediamarkt.at/de/product/_midea-portasplit-cool-mobile-split-klimaanlage-8000btu-mobile-split-klimaanlage-a-28-m-8000-btuh-weiss-2080923.html",
  },
];

// The PDP embeds window.__PRELOADED_STATE__ as a JS object literal whose apollo
// section appears with escaped quotes (\"). Both plain and escaped forms are
// matched. Values scoped to the product id to avoid picking up recommendations.
function extractScoped(html: string, typename: string, productId: string, field: string): string | null {
  const re = new RegExp(String.raw`"${typename}","id":"Media:de:${productId}"[\s\S]{0,400}?${field}\\?":\\?"([A-Z_]+)`);
  return re.exec(html)?.[1] ?? null;
}

const ONLINE_IN_STOCK = new Set(["AVAILABLE", "BUYABLE", "IN_STOCK"]);
// MediaMarkt exposes both the verbose (…_NOT_AVAILABLE) and the shorter …_NA_INDEX
// forms of the out-of-stock states, so both are recognised.
const ONLINE_OUT_OF_STOCK = new Set([
  "TEMPORARILY_NOT_AVAILABLE",
  "PERMANENTLY_NOT_AVAILABLE",
  "TEMPORARILY_NA_INDEX",
  "PERMANENTLY_NA_INDEX",
  "NOT_AVAILABLE",
  "SOLD_OUT",
  "NOT_IN_ASSORTMENT",
]);

function combineStatus(ld: StockStatus, onlineStatus: string | null): StockStatus {
  if (onlineStatus && ONLINE_IN_STOCK.has(onlineStatus)) return "in_stock";
  if (ld !== "unknown") return ld;
  if (onlineStatus && ONLINE_OUT_OF_STOCK.has(onlineStatus)) return "out_of_stock";
  return "unknown";
}

// Note: no store-pickup signal. MediaMarkt's CofrPickupFeature.displayStatus is a
// generic, stock-independent default (it stays PARTIALLY_AVAILABLE even for a
// permanently sold-out item, because pickupStatus is always NO_STORE_SELECTED for us),
// and the real per-store availability API is Cloudflare-blocked. Reporting it produced
// false "in einzelnen Märkten abholbar" claims, so we don't.
export const mediamarktAdapter: RetailerAdapter = {
  slug: "mediamarkt",
  tier: "slow",
  async check(fetchFn) {
    const offers: OnlineOffer[] = [];
    for (const product of PRODUCTS) {
      const res = await politeFetch(product.url, { headers: { Accept: "text/html" } }, fetchFn);
      const html = await res.text();
      const ld = parseProductLd(html);
      const onlineStatus = extractScoped(html, "CofrOnlineStatusFeature", product.productId, "onlineStatus");
      // A discontinued product can drop its Product JSON-LD while still exposing the
      // authoritative onlineStatus, so JSON-LD is not required — but a page with neither
      // signal is blocked or fully changed, so surface it (poller backs off / markUnknown).
      if (!ld && !onlineStatus) {
        throw new Error(`mediamarkt: no product data for ${product.productId} (blocked or layout change)`);
      }
      offers.push({
        variant: product.variant,
        url: product.url,
        priceCents: ld?.priceCents ?? null,
        status: combineStatus(ld?.status ?? "unknown", onlineStatus),
      });
    }
    return { retailerSlug: "mediamarkt", offers, storeStock: null };
  },
};
