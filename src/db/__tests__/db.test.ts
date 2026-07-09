import { describe, expect, it } from "vitest";
import { createDb, OfferEntity, RetailerEntity, VariantEntity } from "@/db";
import { seed } from "@/db/seed";

describe("createDb", () => {
  it("seeds variants and retailers idempotently", async () => {
    const db = await createDb(":memory:");
    expect(await db.getRepository(VariantEntity).count()).toBe(2);
    expect(await db.getRepository(RetailerEntity).count()).toBe(6);

    await seed(db);
    expect(await db.getRepository(VariantEntity).count()).toBe(2);
    expect(await db.getRepository(RetailerEntity).count()).toBe(6);
    await db.destroy();
  });

  it("reconciles away retailers/offers no longer in the code", async () => {
    const db = await createDb(":memory:");
    // Simulate a dropped retailer still lingering in the DB.
    await db.getRepository(RetailerEntity).insert({ slug: "pv24", name: "PV-24", homepage: "https://www.pv-24.at" });
    await db.getRepository(OfferEntity).insert({
      retailerSlug: "pv24",
      variantSlug: "portasplit",
      url: "https://www.pv-24.at/p",
      priceCents: null,
      status: "unknown",
      lastCheckedAt: 0,
      lastChangedAt: 0,
    });

    await seed(db); // reconcile runs

    expect(await db.getRepository(RetailerEntity).findOneBy({ slug: "pv24" })).toBeNull();
    expect(await db.getRepository(OfferEntity).findBy({ retailerSlug: "pv24" })).toHaveLength(0);
    expect(await db.getRepository(RetailerEntity).count()).toBe(6); // only the known set remains
    await db.destroy();
  });

  it("roundtrips an offer row", async () => {
    const db = await createDb(":memory:");
    const repo = db.getRepository(OfferEntity);
    await repo.clear();
    await repo.insert({
      retailerSlug: "bauhaus",
      variantSlug: "portasplit",
      url: "https://www.bauhaus.at/p/123",
      priceCents: 79900,
      status: "in_stock",
      lastCheckedAt: 1000,
      lastChangedAt: 1000,
    });
    const row = await repo.findOneByOrFail({ retailerSlug: "bauhaus" });
    expect(row.priceCents).toBe(79900);
    expect(row.status).toBe("in_stock");
    await db.destroy();
  });
});
