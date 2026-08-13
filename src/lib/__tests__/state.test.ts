import { beforeEach, describe, expect, it } from "vitest";
import { EventEntity, OfferEntity, StoreAvailabilityEntity, StoreEntity, type AppDb } from "@/db";
import { createTestDb } from "@/db/test-utils";
import { computeDiff } from "@/lib/diff";
import { loadPrevState, markUnknown, persistResult } from "@/lib/state";
import type { RetailerResult } from "@/lib/retailers/types";

const RESULT: RetailerResult = {
  retailerSlug: "obi",
  offers: [
    {
      variant: "portasplit",
      url: "https://www.obi.at/p/3586245/x",
      priceCents: 89999,
      status: "in_stock",
      pickupNote: null,
    },
  ],
  storeStock: [
    {
      store: { externalId: "002", name: "Sankt Veit", zip: "9300", city: "St. Veit", lat: 46.74786, lng: 14.384002 },
      variant: "portasplit",
      inStock: true,
    },
  ],
};

describe("state persistence", () => {
  let db: AppDb;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("persists a result and reflects it in loadPrevState", async () => {
    const prev1 = await loadPrevState(db, "obi");
    expect(prev1.offers.size).toBe(0);

    const events = computeDiff(prev1, RESULT);
    expect(events.map((e) => e.type).sort()).toEqual(["online_restock", "store_restock"]);
    await persistResult(db, RESULT, events, 1000);

    const prev2 = await loadPrevState(db, "obi");
    expect(prev2.offers.get("portasplit")).toEqual({ status: "in_stock", priceCents: 89999 });
    expect(prev2.storeStock.get("002:portasplit")).toBe(true);

    // events written with resolved store id
    const rows = await db.getRepository(EventEntity).find();
    expect(rows).toHaveLength(2);
    const storeEvent = rows.find((r) => r.type === "store_restock")!;
    const storeRow = await db.getRepository(StoreEntity).findOneByOrFail({ externalId: "002" });
    expect(storeEvent.storeId).toBe(storeRow.id);
    expect(storeEvent.createdAt).toBe(1000);
  });

  it("upserts without duplicating on second persist and tracks lastChangedAt", async () => {
    await persistResult(db, RESULT, computeDiff(await loadPrevState(db, "obi"), RESULT), 1000);
    await persistResult(db, RESULT, [], 2000);

    expect(await db.getRepository(OfferEntity).count()).toBe(1);
    expect(await db.getRepository(StoreEntity).count()).toBe(1);
    expect(await db.getRepository(StoreAvailabilityEntity).count()).toBe(1);

    const offer = await db.getRepository(OfferEntity).findOneByOrFail({ retailerSlug: "obi" });
    expect(offer.lastCheckedAt).toBe(2000);
    expect(offer.lastChangedAt).toBe(1000); // unchanged since first persist

    // now flip to out_of_stock
    const changed: RetailerResult = {
      ...RESULT,
      offers: [{ ...RESULT.offers[0], status: "out_of_stock" }],
    };
    await persistResult(db, changed, computeDiff(await loadPrevState(db, "obi"), changed), 3000);
    const offer2 = await db.getRepository(OfferEntity).findOneByOrFail({ retailerSlug: "obi" });
    expect(offer2.status).toBe("out_of_stock");
    expect(offer2.lastChangedAt).toBe(3000);
  });

  it("markUnknown flips all retailer offers to unknown", async () => {
    await persistResult(db, RESULT, [], 1000);
    await markUnknown(db, "obi", 2000);
    const offer = await db.getRepository(OfferEntity).findOneByOrFail({ retailerSlug: "obi" });
    expect(offer.status).toBe("unknown");
    expect(offer.lastCheckedAt).toBe(2000);
  });
});
