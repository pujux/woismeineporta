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
  const re = new RegExp(
    `"${typename}","id":"Media:de:${productId}"[\\s\\S]{0,400}?${field}\\\\?":\\\\?"([A-Z_]+)`,
  );
  return re.exec(html)?.[1] ?? null;
}

const ONLINE_IN_STOCK = new Set(["AVAILABLE", "BUYABLE", "IN_STOCK"]);
const ONLINE_OUT_OF_STOCK = new Set([
  "TEMPORARILY_NOT_AVAILABLE",
  "PERMANENTLY_NOT_AVAILABLE",
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

function pickupNote(displayStatus: string | null): string | null {
  switch (displayStatus) {
    case "AVAILABLE":
      return "In Märkten abholbar";
    case "PARTIALLY_AVAILABLE":
      return "In einzelnen Märkten abholbar";
    default:
      return null;
  }
}

export const mediamarktAdapter: RetailerAdapter = {
  slug: "mediamarkt",
  tier: "slow",
  async check(fetchFn) {
    const offers: OnlineOffer[] = [];
    for (const product of PRODUCTS) {
      const res = await politeFetch(
        product.url,
        { headers: { Accept: "text/html" } },
        fetchFn,
      );
      const html = await res.text();
      const ld = parseProductLd(html);
      if (!ld) throw new Error(`mediamarkt: no product JSON-LD for ${product.productId}`);
      const onlineStatus = extractScoped(html, "CofrOnlineStatusFeature", product.productId, "onlineStatus");
      const displayStatus = extractScoped(html, "CofrPickupFeature", product.productId, "displayStatus");
      offers.push({
        variant: product.variant,
        url: product.url,
        priceCents: ld.priceCents,
        status: combineStatus(ld.status, onlineStatus),
        pickupNote: pickupNote(displayStatus),
      });
    }
    return { retailerSlug: "mediamarkt", offers, storeStock: null };
  },
};
