export type StockStatus = "in_stock" | "out_of_stock" | "unknown";
export type VariantSlug = "portasplit" | "portasplit-cool";

export interface OnlineOffer {
  variant: VariantSlug;
  url: string;
  priceCents: number | null;
  status: StockStatus;
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
  /**
   * Consecutive failed checks before offers are marked unknown and the owner is
   * alerted. Defaults to 3. Raise it for an inherently flaky adapter (e.g. Amazon,
   * which is frequently CAPTCHA'd) so brief blips don't cause on/off health-alert churn.
   */
  failuresBeforeUnknown?: number;
  check(fetchFn: typeof fetch): Promise<RetailerResult>;
}
