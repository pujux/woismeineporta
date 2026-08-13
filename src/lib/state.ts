import { EventEntity, OfferEntity, StoreAvailabilityEntity, StoreEntity, type AppDb } from "@/db";
import type { PrevState, StockEvent } from "./diff";
import type { RetailerResult } from "./retailers/types";
import type { StockStatusDb } from "@/db/entities";

export async function loadPrevState(db: AppDb, retailerSlug: string): Promise<PrevState> {
  const offers = await db.getRepository(OfferEntity).findBy({ retailerSlug });
  const stores = await db.getRepository(StoreEntity).findBy({ retailerSlug });
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const availability = stores.length
    ? await db
        .getRepository(StoreAvailabilityEntity)
        .createQueryBuilder("sa")
        .where("sa.store_id IN (:...ids)", { ids: stores.map((s) => s.id) })
        .getMany()
    : [];

  return {
    offers: new Map(offers.map((o) => [o.variantSlug, { status: o.status, priceCents: o.priceCents }])),
    storeStock: new Map(availability.map((a) => [`${storeById.get(a.storeId)!.externalId}:${a.variantSlug}`, a.inStock])),
  };
}

export async function persistResult(db: AppDb, result: RetailerResult, events: StockEvent[], now: number): Promise<void> {
  const { retailerSlug } = result;
  const offerRepo = db.getRepository(OfferEntity);
  const prev = await loadPrevState(db, retailerSlug);

  for (const offer of result.offers) {
    const before = prev.offers.get(offer.variant);
    const changed = before?.status !== offer.status || before.priceCents !== offer.priceCents;
    const existing = await offerRepo.findOneBy({ retailerSlug, variantSlug: offer.variant });
    const row = {
      retailerSlug,
      variantSlug: offer.variant,
      url: offer.url,
      priceCents: offer.priceCents,
      status: offer.status as StockStatusDb,
      pickupNote: offer.pickupNote ?? null,
      lastCheckedAt: now,
      lastChangedAt: changed ? now : (existing?.lastChangedAt ?? now),
    };
    if (existing) await offerRepo.update(existing.id, row);
    else await offerRepo.insert(row);
  }

  const storeRepo = db.getRepository(StoreEntity);
  const saRepo = db.getRepository(StoreAvailabilityEntity);
  const storeIdByExternal = new Map<string, number>();

  if (result.storeStock) {
    const uniqueStores = new Map(result.storeStock.map((s) => [s.store.externalId, s.store]));
    for (const info of uniqueStores.values()) {
      await storeRepo.upsert(
        {
          retailerSlug,
          externalId: info.externalId,
          name: info.name,
          zip: info.zip,
          city: info.city,
          latE6: Math.round(info.lat * 1e6),
          lngE6: Math.round(info.lng * 1e6),
        },
        ["retailerSlug", "externalId"],
      );
    }
    const stored = await storeRepo.findBy({ retailerSlug });
    for (const s of stored) storeIdByExternal.set(s.externalId, s.id);

    for (const entry of result.storeStock) {
      const storeId = storeIdByExternal.get(entry.store.externalId)!;
      const key = `${entry.store.externalId}:${entry.variant}`;
      const changed = (prev.storeStock.get(key) ?? null) !== entry.inStock;
      const existing = await saRepo.findOneBy({ storeId, variantSlug: entry.variant });
      const row = {
        storeId,
        variantSlug: entry.variant,
        inStock: entry.inStock,
        lastCheckedAt: now,
        lastChangedAt: changed ? now : (existing?.lastChangedAt ?? now),
      };
      if (existing) await saRepo.update(existing.id, row);
      else await saRepo.insert(row);
    }
  } else {
    const stored = await storeRepo.findBy({ retailerSlug });
    for (const s of stored) storeIdByExternal.set(s.externalId, s.id);
  }

  if (events.length) {
    await db.getRepository(EventEntity).insert(
      events.map((e) => ({
        type: e.type,
        retailerSlug: e.retailerSlug,
        variantSlug: e.variantSlug,
        storeId: e.storeExternalId ? (storeIdByExternal.get(e.storeExternalId) ?? null) : null,
        priceCents: e.priceCents ?? null,
        createdAt: now,
      })),
    );
  }
}

export async function markUnknown(db: AppDb, retailerSlug: string, now: number): Promise<void> {
  await db.getRepository(OfferEntity).update({ retailerSlug }, { status: "unknown", lastCheckedAt: now });
}
