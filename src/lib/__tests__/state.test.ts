import { beforeEach, describe, expect, it } from "vitest";
import { EventEntity, OfferEntity, StoreAvailabilityEntity, StoreEntity, type AppDb } from "@/db";
import { createTestDb } from "@/db/test-utils";
import { computeDiff } from "@/lib/diff";
import { applyDebounce, loadPrevState, markUnknown, persistResult } from "@/lib/state";
import type { RetailerAdapter, RetailerResult, StockStatus } from "@/lib/retailers/types";

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

describe("applyDebounce (hysteresis)", () => {
  let db: AppDb;
  const DEBOUNCE_MS = 10 * 60_000;

  const obAdapter: RetailerAdapter = { slug: "online-batterien", tier: "slow", debounceMs: DEBOUNCE_MS, check: async () => ob("in_stock") };
  const plainAdapter: RetailerAdapter = { slug: "obi", tier: "slow", check: async () => RESULT };

  const ob = (status: StockStatus, priceCents = 119002): RetailerResult => ({
    retailerSlug: "online-batterien",
    offers: [{ variant: "portasplit", url: "https://online-batterien.at/p", priceCents, status, pickupNote: null }],
    storeStock: null,
  });
  const offerRow = () => db.getRepository(OfferEntity).findOneByOrFail({ retailerSlug: "online-batterien" });
  const seedInStock = () => persistResult(db, ob("in_stock"), [], 1000);

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("is a no-op for an adapter without debounceMs (change passes through immediately)", async () => {
    await persistResult(db, RESULT, [], 1000);
    const changed = { ...RESULT, offers: [{ ...RESULT.offers[0], status: "out_of_stock" as const }] };
    const eff = await applyDebounce(db, plainAdapter, changed, 2000);
    expect(eff.offers[0].status).toBe("out_of_stock");
    const row = await db.getRepository(OfferEntity).findOneByOrFail({ retailerSlug: "obi" });
    expect(row.pendingStatus).toBeNull();
  });

  it("holds a short blip (status + price frozen) and never commits it", async () => {
    await seedInStock();
    // out_of_stock blip at a different price → held at the committed in_stock/price
    const eff1 = await applyDebounce(db, obAdapter, ob("out_of_stock", 150000), 2000);
    expect(eff1.offers[0].status).toBe("in_stock");
    expect(eff1.offers[0].priceCents).toBe(119002);
    const row1 = await offerRow();
    expect(row1.pendingStatus).toBe("out_of_stock");
    expect(row1.pendingSince).toBe(2000);

    // blip ends within the window → pending cleared, still in_stock
    const eff2 = await applyDebounce(db, obAdapter, ob("in_stock"), 2000 + 180_000);
    expect(eff2.offers[0].status).toBe("in_stock");
    expect((await offerRow()).pendingStatus).toBeNull();
  });

  it("promotes a change once it persists past the window", async () => {
    await seedInStock();
    const eff1 = await applyDebounce(db, obAdapter, ob("out_of_stock"), 2000);
    expect(eff1.offers[0].status).toBe("in_stock"); // held

    const eff2 = await applyDebounce(db, obAdapter, ob("out_of_stock"), 2000 + DEBOUNCE_MS);
    expect(eff2.offers[0].status).toBe("out_of_stock"); // confirmed → promoted
    expect((await offerRow()).pendingStatus).toBeNull();
  });

  it("does not delay recovery from unknown (post-outage)", async () => {
    await seedInStock();
    await markUnknown(db, "online-batterien", 1500);
    const eff = await applyDebounce(db, obAdapter, ob("in_stock"), 2000);
    expect(eff.offers[0].status).toBe("in_stock"); // immediate, not held
  });
});
