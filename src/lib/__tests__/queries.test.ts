import { beforeEach, describe, expect, it } from "vitest";
import { EventEntity, OfferEntity, StoreAvailabilityEntity, StoreEntity, type AppDb } from "@/db";
import { createTestDb } from "@/db/test-utils";
import { findStoresNear, getRecentEvents, getVariantStatuses, listAllStores } from "@/lib/queries";

describe("queries", () => {
  let db: AppDb;

  beforeEach(async () => {
    db = await createTestDb();
    await db.getRepository(OfferEntity).insert({
      retailerSlug: "obi",
      variantSlug: "portasplit",
      url: "https://www.obi.at/p/1",
      priceCents: 89999,
      status: "in_stock",
      pickupNote: null,
      lastCheckedAt: 5000,
      lastChangedAt: 4000,
    });
    // Vienna store (in stock) + St. Veit store (out of stock)
    await db.getRepository(StoreEntity).insert([
      { retailerSlug: "obi", externalId: "010", name: "Wien 10", zip: "1100", city: "Wien", latE6: 48_180_000, lngE6: 16_360_000 },
      { retailerSlug: "obi", externalId: "002", name: "Sankt Veit", zip: "9300", city: "St. Veit", latE6: 46_747_860, lngE6: 14_384_002 },
    ]);
    const stores = await db.getRepository(StoreEntity).find();
    const byExt = new Map(stores.map((s) => [s.externalId, s.id]));
    await db.getRepository(StoreAvailabilityEntity).insert([
      { storeId: byExt.get("010")!, variantSlug: "portasplit", inStock: true, lastCheckedAt: 5000, lastChangedAt: 5000 },
      { storeId: byExt.get("002")!, variantSlug: "portasplit", inStock: false, lastCheckedAt: 5000, lastChangedAt: 5000 },
    ]);
    await db.getRepository(EventEntity).insert([
      { type: "online_restock", retailerSlug: "obi", variantSlug: "portasplit", storeId: null, priceCents: 89999, createdAt: 4000 },
      { type: "store_restock", retailerSlug: "obi", variantSlug: "portasplit", storeId: byExt.get("010")!, priceCents: null, createdAt: 5000 },
    ]);
  });

  it("getVariantStatuses returns both variants with offers where present", async () => {
    const statuses = await getVariantStatuses(db);
    expect(statuses.map((s) => s.variant.slug)).toEqual(["portasplit", "portasplit-cool"]);
    const base = statuses[0];
    expect(base.variant.uvpCents).toBe(119900);
    expect(base.offers).toHaveLength(1);
    expect(base.offers[0]).toMatchObject({
      retailerSlug: "obi",
      retailerName: "OBI",
      status: "in_stock",
      priceCents: 89999,
      lastCheckedAt: 5000,
    });
    expect(statuses[1].offers).toHaveLength(0);
  });

  it("getRecentEvents returns newest first with names resolved", async () => {
    const events = await getRecentEvents(db, 10);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "store_restock",
      retailerName: "OBI",
      variantName: "Midea PortaSplit",
      storeName: "Wien 10",
      createdAt: 5000,
      url: "https://www.obi.at/p/1",
    });
    expect(events[1].storeName).toBeNull();
    expect(events[1].url).toBe("https://www.obi.at/p/1");
  });

  it("findStoresNear filters by radius and sorts in-stock first", async () => {
    const near = await findStoresNear(db, "1010", 50);
    expect(near).toHaveLength(1);
    expect(near[0]).toMatchObject({ name: "Wien 10", inStock: true });
    expect(near[0].distanceKm).toBeGreaterThan(0);
    expect(near[0].distanceKm).toBeLessThan(20);

    const wide = await findStoresNear(db, "1010", 300);
    expect(wide).toHaveLength(2);
    expect(wide[0].inStock).toBe(true); // in-stock first even though both within radius

    expect(await findStoresNear(db, "0000", 50)).toEqual([]);
  });

  it("listAllStores returns every store with coordinates, in-stock first", async () => {
    const all = await listAllStores(db);
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ name: "Wien 10", inStock: true, distanceKm: null });
    expect(all[0].lat).toBeCloseTo(48.18, 2);
    expect(all[0].lng).toBeCloseTo(16.36, 2);
    expect(all[1].inStock).toBe(false);
  });

  it("findStoresNear can filter by variant", async () => {
    const near = await findStoresNear(db, "1010", 300, "portasplit-cool");
    expect(near).toEqual([]);
  });
});
