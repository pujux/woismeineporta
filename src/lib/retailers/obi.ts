import { politeFetch } from "./fetch";
import { parseProductLd } from "./jsonld";
import type {
  OnlineOffer,
  RetailerAdapter,
  StoreInfo,
  StoreStock,
  VariantSlug,
} from "./types";

const PRODUCTS: Array<{ variant: VariantSlug; sku: string; url: string }> = [
  {
    variant: "portasplit",
    sku: "3586245",
    url: "https://www.obi.at/p/3586245/midea-mobile-split-klimaanlage-portasplit",
  },
  {
    variant: "portasplit-cool",
    sku: "4593455",
    url: "https://www.obi.at/p/4593455/midea-split-klimaanlage-portasplit-cool-mobil-weissgrau",
  },
];

const STORE_DIRECTORY_URL = "https://www.obi.at/api/disc/store/locator/country/AT";
const STOCK_CHUNK_SIZE = 10; // API rejects more than 10 storeIds per request

interface ObiStore {
  storeNumber: string;
  name: string;
  address: { street: string; zip: string; city: string; lat: number; lon: number };
}

async function fetchStores(fetchFn: typeof fetch): Promise<StoreInfo[]> {
  const res = await politeFetch(
    STORE_DIRECTORY_URL,
    { headers: { Accept: "application/json" } },
    fetchFn,
  );
  const body = (await res.json()) as { stores: ObiStore[] };
  return body.stores.map((s) => ({
    externalId: s.storeNumber,
    name: s.name,
    zip: s.address.zip,
    city: s.address.city,
    lat: s.address.lat,
    lng: s.address.lon,
  }));
}

async function fetchStock(
  fetchFn: typeof fetch,
  sku: string,
  storeIds: string[],
): Promise<Map<string, number>> {
  const quantities = new Map<string, number>();
  for (let i = 0; i < storeIds.length; i += STOCK_CHUNK_SIZE) {
    const chunk = storeIds.slice(i, i + STOCK_CHUNK_SIZE);
    const res = await politeFetch(
      `https://www.obi.at/api/pdp/v1/stock/${sku}?storeIds=${chunk.join(",")}`,
      { headers: { Accept: "application/json" } },
      fetchFn,
    );
    const rows = (await res.json()) as Array<{
      storeId: string;
      availableQuantity: number;
    }>;
    if (!Array.isArray(rows)) throw new Error("obi: unexpected stock payload");
    for (const row of rows) quantities.set(row.storeId, row.availableQuantity);
  }
  return quantities;
}

export const obiAdapter: RetailerAdapter = {
  slug: "obi",
  tier: "fast",
  async check(fetchFn) {
    const offers: OnlineOffer[] = [];
    for (const product of PRODUCTS) {
      const res = await politeFetch(
        product.url,
        { headers: { Accept: "text/html" } },
        fetchFn,
      );
      const ld = parseProductLd(await res.text());
      if (!ld) throw new Error(`obi: no product JSON-LD for ${product.sku}`);
      offers.push({ variant: product.variant, url: product.url, ...ld });
    }

    const stores = await fetchStores(fetchFn);
    const storeIds = stores.map((s) => s.externalId);
    const storeStock: StoreStock[] = [];
    for (const product of PRODUCTS) {
      const quantities = await fetchStock(fetchFn, product.sku, storeIds);
      for (const store of stores) {
        storeStock.push({
          store,
          variant: product.variant,
          inStock: (quantities.get(store.externalId) ?? 0) > 0,
        });
      }
    }

    return { retailerSlug: "obi", offers, storeStock };
  },
};
