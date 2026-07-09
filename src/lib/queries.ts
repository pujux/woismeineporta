import { EventEntity, OfferEntity, RetailerEntity, StoreAvailabilityEntity, StoreEntity, VariantEntity, type AppDb } from "@/db";
import { distanceKm, plzToLatLng } from "./geo";
import type { StockStatus, VariantSlug } from "./retailers/types";
import { combineTimelines, computeTimeline, priceRange, TIMELINE_WINDOW_MS, type TimelineBucket, type TimelineEvent } from "./stats";

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
  const retailers = new Map((await db.getRepository(RetailerEntity).find()).map((r) => [r.slug, r]));
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

export interface TimelineSeries {
  buckets: TimelineBucket[];
  priceRange: [number, number] | null;
}
export interface VariantTimeline {
  slug: VariantSlug;
  name: string;
  /** Start of the observed window, or null when there's no history yet. */
  since: number | null;
  now: number;
  /** Restock + sell-out events observed (for "Basis: N Events"). */
  eventCount: number;
  shops: Array<{ slug: string; name: string }>;
  /** Keyed by "all" + each shop slug. */
  series: Record<string, TimelineSeries>;
}

/**
 * Builds the availability + price timeline per variant (all shops + each shop),
 * from the online event log. All series in a variant share one `since`/bucket grid so
 * the columns line up and can be combined into an "all shops" view.
 */
export async function getAvailabilityTimeline(db: AppDb, now: number = Date.now()): Promise<VariantTimeline[]> {
  const variants = await db.getRepository(VariantEntity).find();
  const retailers = new Map((await db.getRepository(RetailerEntity).find()).map((r) => [r.slug, r.name]));
  const offers = await db.getRepository(OfferEntity).find();

  const evRows = await db
    .getRepository(EventEntity)
    .createQueryBuilder("e")
    .where("e.created_at >= :start", { start: now - TIMELINE_WINDOW_MS })
    .andWhere("e.store_id IS NULL")
    .getMany();
  const eventsByOffer = new Map<string, TimelineEvent[]>();
  for (const e of evRows) {
    const key = `${e.retailerSlug}:${e.variantSlug}`;
    (eventsByOffer.get(key) ?? eventsByOffer.set(key, []).get(key)!).push({ type: e.type, priceCents: e.priceCents, createdAt: e.createdAt });
  }

  return variants.map((variant) => {
    const vOffers = offers.filter((o) => o.variantSlug === variant.slug).sort((a, b) => (retailers.get(a.retailerSlug) ?? a.retailerSlug).localeCompare(retailers.get(b.retailerSlug) ?? b.retailerSlug));
    const shops = vOffers.map((o) => ({ slug: o.retailerSlug, name: retailers.get(o.retailerSlug) ?? o.retailerSlug }));

    const allEvents = vOffers.flatMap((o) => eventsByOffer.get(`${o.retailerSlug}:${variant.slug}`) ?? []);
    const availEvents = allEvents.filter((e) => e.type === "online_restock" || e.type === "online_soldout");
    const earliest = availEvents.length ? Math.min(...availEvents.map((e) => e.createdAt)) : null;
    const since = earliest === null ? null : Math.max(earliest, now - TIMELINE_WINDOW_MS);

    const series: Record<string, TimelineSeries> = {};
    if (since !== null) {
      const perShop: TimelineBucket[][] = [];
      for (const o of vOffers) {
        const buckets = computeTimeline(
          eventsByOffer.get(`${o.retailerSlug}:${variant.slug}`) ?? [],
          { status: o.status, priceCents: o.priceCents },
          now,
          since,
        );
        series[o.retailerSlug] = { buckets, priceRange: priceRange(buckets) };
        perShop.push(buckets);
      }
      const all = combineTimelines(perShop);
      series.all = { buckets: all, priceRange: priceRange(all) };
    }

    return {
      slug: variant.slug as VariantSlug,
      name: variant.name,
      since,
      now,
      eventCount: availEvents.length,
      shops,
      series,
    };
  });
}

export interface FeedEvent {
  type: string;
  retailerName: string;
  variantName: string;
  storeName: string | null;
  priceCents: number | null;
  createdAt: number;
  url: string | null;
}

export async function getRecentEvents(db: AppDb, limit = 30): Promise<FeedEvent[]> {
  const events = await db.getRepository(EventEntity).find({
    order: { createdAt: "DESC", id: "DESC" },
    take: limit,
  });
  const retailers = new Map((await db.getRepository(RetailerEntity).find()).map((r) => [r.slug, r.name]));
  const variants = new Map((await db.getRepository(VariantEntity).find()).map((v) => [v.slug, v.name]));
  const storeIds = [...new Set(events.map((e) => e.storeId).filter((id): id is number => id !== null))];
  const stores = storeIds.length
    ? await db.getRepository(StoreEntity).createQueryBuilder("s").where("s.id IN (:...ids)", { ids: storeIds }).getMany()
    : [];
  const storeById = new Map(stores.map((s) => [s.id, s.name]));
  const urlByOffer = new Map((await db.getRepository(OfferEntity).find()).map((o) => [`${o.retailerSlug}:${o.variantSlug}`, o.url]));

  return events.map((e) => ({
    type: e.type,
    retailerName: retailers.get(e.retailerSlug) ?? e.retailerSlug,
    variantName: variants.get(e.variantSlug) ?? e.variantSlug,
    storeName: e.storeId !== null ? (storeById.get(e.storeId) ?? null) : null,
    priceCents: e.priceCents,
    createdAt: e.createdAt,
    url: urlByOffer.get(`${e.retailerSlug}:${e.variantSlug}`) ?? null,
  }));
}

export interface NearbyStore {
  retailerName: string;
  name: string;
  zip: string;
  city: string;
  lat: number;
  lng: number;
  distanceKm: number | null;
  inStock: boolean;
  lastCheckedAt: number;
}

/** All stores with availability data, no location filter (map view). */
export async function listAllStores(db: AppDb, variant?: VariantSlug): Promise<NearbyStore[]> {
  const stores = await db.getRepository(StoreEntity).find();
  const retailers = new Map((await db.getRepository(RetailerEntity).find()).map((r) => [r.slug, r.name]));
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
      lat: s.latE6 / 1e6,
      lng: s.lngE6 / 1e6,
      distanceKm: null,
      inStock: byStore.get(s.id)!.inStock,
      lastCheckedAt: byStore.get(s.id)!.lastCheckedAt,
    }))
    .sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.zip.localeCompare(b.zip));
}

export async function findStoresNear(db: AppDb, zip: string, radiusKm: number, variant?: VariantSlug): Promise<NearbyStore[]> {
  const home = plzToLatLng(zip);
  if (!home) return [];
  return findStoresNearPoint(db, home, radiusKm, variant);
}

/** Same as findStoresNear but from an arbitrary point (e.g. device geolocation). */
export async function findStoresNearPoint(
  db: AppDb,
  home: { lat: number; lng: number },
  radiusKm: number,
  variant?: VariantSlug,
): Promise<NearbyStore[]> {
  const stores = await db.getRepository(StoreEntity).find();
  const retailers = new Map((await db.getRepository(RetailerEntity).find()).map((r) => [r.slug, r.name]));
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
      lat: s.latE6 / 1e6,
      lng: s.lngE6 / 1e6,
      distanceKm: distanceKm(home.lat, home.lng, s.latE6 / 1e6, s.lngE6 / 1e6),
      inStock: byStore.get(s.id)!.inStock,
      lastCheckedAt: byStore.get(s.id)!.lastCheckedAt,
    }))
    .filter((s) => s.distanceKm! <= radiusKm)
    .sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.distanceKm! - b.distanceKm!);
}
