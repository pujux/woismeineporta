export type StockStatus = "in_stock" | "out_of_stock" | "unknown";
export type VariantSlug = "portasplit" | "portasplit-cool";

export interface OnlineOffer {
  variant: VariantSlug;
  url: string;
  priceCents: number | null;
  status: StockStatus;
  /** Extra human-readable availability hint (e.g. MediaMarkt aggregate pickup signal). */
  pickupNote?: string | null;
}

export interface StoreInfo {
  externalId: string;
  name: string;
  zip: string;
  city: string;
  /** decimal degrees */
  lat: number;
  lng: number;
}

export interface StoreStock {
  store: StoreInfo;
  variant: VariantSlug;
  inStock: boolean;
}

export interface RetailerResult {
  retailerSlug: string;
  offers: OnlineOffer[];
  /** null = store-level tracking unsupported */
  storeStock: StoreStock[] | null;
}

export interface RetailerAdapter {
  slug: string;
  tier: "fast" | "slow";
  check(fetchFn: typeof fetch): Promise<RetailerResult>;
}
