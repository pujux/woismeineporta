import {
  EventEntity,
  OfferEntity,
  RetailerEntity,
  StoreAvailabilityEntity,
  StoreEntity,
  VariantEntity,
  type AppDb,
} from "@/db";
import { distanceKm, plzToLatLng } from "./geo";
import type { StockStatus, VariantSlug } from "./retailers/types";

export interface VariantStatus {
  variant: { slug: VariantSlug; name: string; uvpCents: number };
  offers: Array<{
    retailerSlug: string;
    retailerName: string;
    url: string;
    priceCents: number | null;
    status: StockStatus;
    pickupNote: string | null;
    lastCheckedAt: number;
    lastChangedAt: number;
  }>;
}

export async function getVariantStatuses(db: AppDb): Promise<VariantStatus[]> {
  const variants = await db.getRepository(VariantEntity).find();
  const retailers = new Map(
    (await db.getRepository(RetailerEntity).find()).map((r) => [r.slug, r]),
  );
  const offers = await db.getRepository(OfferEntity).find();

  return variants.map((variant) => ({
    variant: {
      slug: variant.slug as VariantSlug,
      name: variant.name,
      uvpCents: variant.uvpCents,
    },
    offers: offers
      .filter((o) => o.variantSlug === variant.slug)
      .map((o) => ({
        retailerSlug: o.retailerSlug,
        retailerName: retailers.get(o.retailerSlug)?.name ?? o.retailerSlug,
        url: o.url,
        priceCents: o.priceCents,
        status: o.status,
        pickupNote: o.pickupNote,
        lastCheckedAt: o.lastCheckedAt,
        lastChangedAt: o.lastChangedAt,
      }))
      .sort((a, b) => a.retailerName.localeCompare(b.retailerName)),
  }));
}

export interface FeedEvent {
  type: string;
  retailerName: string;
  variantName: string;
  storeName: string | null;
  priceCents: number | null;
  createdAt: number;
}

export async function getRecentEvents(db: AppDb, limit = 30): Promise<FeedEvent[]> {
  const events = await db.getRepository(EventEntity).find({
    order: { createdAt: "DESC", id: "DESC" },
    take: limit,
  });
  const retailers = new Map(
    (await db.getRepository(RetailerEntity).find()).map((r) => [r.slug, r.name]),
  );
  const variants = new Map(
    (await db.getRepository(VariantEntity).find()).map((v) => [v.slug, v.name]),
  );
  const storeIds = [...new Set(events.map((e) => e.storeId).filter((id): id is number => id !== null))];
  const stores = storeIds.length
    ? await db.getRepository(StoreEntity).createQueryBuilder("s").where("s.id IN (:...ids)", { ids: storeIds }).getMany()
    : [];
  const storeById = new Map(stores.map((s) => [s.id, s.name]));

  return events.map((e) => ({
    type: e.type,
    retailerName: retailers.get(e.retailerSlug) ?? e.retailerSlug,
    variantName: variants.get(e.variantSlug) ?? e.variantSlug,
    storeName: e.storeId !== null ? (storeById.get(e.storeId) ?? null) : null,
    priceCents: e.priceCents,
    createdAt: e.createdAt,
  }));
}

export interface NearbyStore {
  retailerName: string;
  name: string;
  zip: string;
  city: string;
  distanceKm: number;
  inStock: boolean;
  lastCheckedAt: number;
}

export async function findStoresNear(
  db: AppDb,
  zip: string,
  radiusKm: number,
  variant?: VariantSlug,
): Promise<NearbyStore[]> {
  const home = plzToLatLng(zip);
  if (!home) return [];

  const stores = await db.getRepository(StoreEntity).find();
  const retailers = new Map(
    (await db.getRepository(RetailerEntity).find()).map((r) => [r.slug, r.name]),
  );
  const availability = await db.getRepository(StoreAvailabilityEntity).find();

  const byStore = new Map<number, { inStock: boolean; lastCheckedAt: number }>();
  for (const a of availability) {
    if (variant && a.variantSlug !== variant) continue;
    const existing = byStore.get(a.storeId);
    byStore.set(a.storeId, {
      inStock: (existing?.inStock ?? false) || a.inStock,
      lastCheckedAt: Math.max(existing?.lastCheckedAt ?? 0, a.lastCheckedAt),
    });
  }

  return stores
    .filter((s) => byStore.has(s.id))
    .map((s) => ({
      retailerName: retailers.get(s.retailerSlug) ?? s.retailerSlug,
      name: s.name,
      zip: s.zip,
      city: s.city,
      distanceKm: distanceKm(home.lat, home.lng, s.latE6 / 1e6, s.lngE6 / 1e6),
      inStock: byStore.get(s.id)!.inStock,
      lastCheckedAt: byStore.get(s.id)!.lastCheckedAt,
    }))
    .filter((s) => s.distanceKm <= radiusKm)
    .sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.distanceKm - b.distanceKm);
}
