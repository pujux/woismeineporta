import { describe, expect, it } from "vitest";
import { createDb, OfferEntity, RetailerEntity, VariantEntity } from "@/db";
import { seed } from "@/db/seed";

describe("createDb", () => {
  it("seeds variants and retailers idempotently", async () => {
    const db = await createDb(":memory:");
    expect(await db.getRepository(VariantEntity).count()).toBe(2);
    expect(await db.getRepository(RetailerEntity).count()).toBe(4);

    await seed(db);
    expect(await db.getRepository(VariantEntity).count()).toBe(2);
    expect(await db.getRepository(RetailerEntity).count()).toBe(4);
    await db.destroy();
  });

  it("roundtrips an offer row", async () => {
    const db = await createDb(":memory:");
    const repo = db.getRepository(OfferEntity);
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
