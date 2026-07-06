import { describe, expect, it } from "vitest";
import { obiAdapter } from "@/lib/retailers/obi";
import { fixture, fixtureFetch } from "./helpers";

function obiFetch(stockFixture: string) {
  return fixtureFetch([
    ["/p/3586245/", fixture("obi-pdp-portasplit.html")],
    ["/p/4593455/", fixture("obi-pdp-portasplit-cool.html")],
    ["/api/disc/store/locator/country/AT", fixture("obi-stores.json")],
    ["/api/pdp/v1/stock/", fixture(stockFixture)],
  ]);
}

describe("obiAdapter", () => {
  it("has the right identity", () => {
    expect(obiAdapter.slug).toBe("obi");
    expect(obiAdapter.tier).toBe("fast");
  });

  it("parses offers and store stock from fixtures", async () => {
    const result = await obiAdapter.check(obiFetch("obi-stock-portasplit.json"));

    expect(result.retailerSlug).toBe("obi");
    expect(result.offers).toHaveLength(2);

    const base = result.offers.find((o) => o.variant === "portasplit")!;
    expect(base.status).toBe("out_of_stock"); // InStoreOnly => not orderable online
    expect(base.priceCents).toBe(89999);
    expect(base.url).toBe(
      "https://www.obi.at/p/3586245/midea-mobile-split-klimaanlage-portasplit",
    );

    const cool = result.offers.find((o) => o.variant === "portasplit-cool")!;
    expect(cool.status).toBe("out_of_stock");
    expect(cool.priceCents).toBe(89999);

    // 79 stores x 2 variants
    expect(result.storeStock).toHaveLength(158);
    const sample = result.storeStock!.find(
      (s) => s.store.externalId === "002" && s.variant === "portasplit",
    )!;
    expect(sample.store.name).toBe("Sankt Veit");
    expect(sample.store.zip).toBe("9300");
    expect(sample.store.lat).toBeCloseTo(46.74786, 3);
    expect(sample.inStock).toBe(false);
  });

  it("reports stock when quantities are positive", async () => {
    const result = await obiAdapter.check(
      obiFetch("obi-stock-portasplit-instock-synthetic.json"),
    );
    const inStock = result.storeStock!.filter(
      (s) => s.variant === "portasplit" && s.inStock,
    );
    expect(inStock.length).toBe(3);
  });

  it("throws when the network fails", async () => {
    const failing = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    await expect(obiAdapter.check(failing)).rejects.toThrow();
  });

  it("throws on malformed stock JSON", async () => {
    const bad = fixtureFetch([
      ["/p/3586245/", fixture("obi-pdp-portasplit.html")],
      ["/p/4593455/", fixture("obi-pdp-portasplit-cool.html")],
      ["/api/disc/store/locator/country/AT", fixture("obi-stores.json")],
      ["/api/pdp/v1/stock/", "<html>oops</html>"],
    ]);
    await expect(obiAdapter.check(bad)).rejects.toThrow();
  });
});
