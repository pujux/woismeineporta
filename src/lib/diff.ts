import type { RetailerResult, StockStatus, VariantSlug } from "./retailers/types";

export interface OfferState {
  status: StockStatus;
  priceCents: number | null;
}

export interface PrevState {
  /** key: variant slug */
  offers: Map<string, OfferState>;
  /** key: `${storeExternalId}:${variant}` */
  storeStock: Map<string, boolean>;
}

export type StockEventType = "online_restock" | "online_soldout" | "price_change" | "store_restock" | "store_soldout";

export interface StockEvent {
  type: StockEventType;
  retailerSlug: string;
  variantSlug: VariantSlug;
  storeExternalId?: string;
  priceCents?: number | null;
}

export function computeDiff(prev: PrevState, result: RetailerResult): StockEvent[] {
  const events: StockEvent[] = [];
  const { retailerSlug } = result;

  for (const offer of result.offers) {
    const before = prev.offers.get(offer.variant);
    const prevStatus = before?.status ?? "unknown";
    const base = { retailerSlug, variantSlug: offer.variant, priceCents: offer.priceCents };

    if (offer.status === "in_stock" && prevStatus !== "in_stock") {
      events.push({ type: "online_restock", ...base });
    } else if (offer.status === "out_of_stock" && prevStatus === "in_stock") {
      events.push({ type: "online_soldout", ...base });
    } else if (
      offer.status === "in_stock" &&
      prevStatus === "in_stock" &&
      offer.priceCents !== null &&
      before?.priceCents !== null &&
      offer.priceCents !== before?.priceCents
    ) {
      events.push({ type: "price_change", ...base });
    }
  }

  for (const entry of result.storeStock ?? []) {
    const key = `${entry.store.externalId}:${entry.variant}`;
    const before = prev.storeStock.get(key) ?? false;
    if (entry.inStock && !before) {
      events.push({
        type: "store_restock",
        retailerSlug,
        variantSlug: entry.variant,
        storeExternalId: entry.store.externalId,
      });
    } else if (!entry.inStock && before) {
      events.push({
        type: "store_soldout",
        retailerSlug,
        variantSlug: entry.variant,
        storeExternalId: entry.store.externalId,
      });
    }
  }

  return events;
}
