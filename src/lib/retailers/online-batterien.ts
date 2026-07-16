import { politeFetch } from "./fetch";
import type { OnlineOffer, RetailerAdapter, StockStatus } from "./types";

// Online-Batterien.at (AKKU SYS GmbH, Vorarlberg) is a Gambio shop with no public JSON API
// (its REST API is auth-gated), but the PDP carries a schema.org Offer as inline microdata —
// <meta itemprop="price"> + <link itemprop="availability" href=".../schema.org/…"> — which is
// stable enough to parse. Product 17837 = 12.000 BTU PortaSplit (heat+cool); no Cool variant.
const URL = "https://online-batterien.at/17837/midea-portasplit-klimageraet-diy-mobile-split-klimaanlage-12k-eek-a/a";

const IN_STOCK = new Set(["InStock", "LimitedAvailability", "OnlineOnly", "PreSale"]);
// PreOrder/BackOrder map to pre_orderable: an order can be placed now, but the unit
// isn't physically in stock yet (a future "Erwarteter Lagerzugang" date). It's a
// display-only state — it must NOT fire a "bestellbar" restock alert.
const PRE_ORDERABLE = new Set(["PreOrder", "BackOrder"]);
const OUT_OF_STOCK = new Set(["OutOfStock", "SoldOut", "Discontinued", "InStoreOnly"]);

export function mapMicrodataAvailability(name: string | undefined): StockStatus {
  if (!name) return "unknown";
  if (IN_STOCK.has(name)) return "in_stock";
  if (PRE_ORDERABLE.has(name)) return "pre_orderable";
  if (OUT_OF_STOCK.has(name)) return "out_of_stock";
  return "unknown";
}

export function parseOnlineBatterien(html: string): OnlineOffer {
  const availName = html.match(/itemprop="availability"[^>]*href="[^"]*schema\.org\/(\w+)"/i)?.[1];
  const priceRaw = html.match(/itemprop="price"[^>]*content="([\d.]+)"/i)?.[1];
  // Neither microdata field present → page structure changed or blocked; surface it so the
  // poller backs off rather than reporting a bogus out_of_stock.
  if (!availName && !priceRaw) {
    throw new Error("online-batterien: no schema.org Offer microdata (blocked or layout change)");
  }
  const cents = priceRaw != null ? Math.round(parseFloat(priceRaw) * 100) : null;
  return {
    variant: "portasplit",
    url: URL,
    priceCents: cents != null && Number.isFinite(cents) ? cents : null,
    status: mapMicrodataAvailability(availName),
  };
}

export const onlineBatterienAdapter: RetailerAdapter = {
  slug: "online-batterien",
  tier: "slow",
  async check(fetchFn) {
    const res = await politeFetch(URL, { headers: { Accept: "text/html", "Accept-Language": "de-AT,de;q=0.9" } }, fetchFn);
    return { retailerSlug: "online-batterien", offers: [parseOnlineBatterien(await res.text())], storeStock: null };
  },
};
