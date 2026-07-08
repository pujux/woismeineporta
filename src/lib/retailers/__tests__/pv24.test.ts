import { describe, expect, it, vi } from "vitest";
import { parseWooCents, pv24Adapter } from "@/lib/retailers/pv24";

describe("parseWooCents (WooCommerce Store API minor-unit integer)", () => {
  it.each([
    [{ price: "108900", currency_minor_unit: 2 }, 108900],
    [{ price: "74900", currency_minor_unit: 2 }, 74900],
    [{ price: "1089000", currency_minor_unit: 3 }, 108900], // 3-decimal currency → still cents
    [{ price: "" }, null],
    [undefined, null],
  ])("%o -> %s", (prices, expected) => {
    expect(parseWooCents(prices as never)).toBe(expected);
  });
});

function wooFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("pv24Adapter", () => {
  it("is online-only on the slow tier", () => {
    expect(pv24Adapter.slug).toBe("pv24");
    expect(pv24Adapter.tier).toBe("slow");
  });

  it("maps in_stock + price from the WooCommerce Store API", async () => {
    const result = await pv24Adapter.check(
      wooFetch({
        is_in_stock: true,
        prices: { price: "108900", currency_minor_unit: 2 },
        permalink: "https://www.pv-24.at/products/midea-porta-split-mobile-klimaanlage-mit-ausseneinheit/",
      }),
    );
    expect(result.storeStock).toBeNull();
    expect(result.offers).toEqual([
      {
        variant: "portasplit",
        url: "https://www.pv-24.at/products/midea-porta-split-mobile-klimaanlage-mit-ausseneinheit/",
        priceCents: 108900,
        status: "in_stock",
      },
    ]);
  });

  it("maps out_of_stock (price still reported)", async () => {
    const result = await pv24Adapter.check(
      wooFetch({ is_in_stock: false, prices: { price: "108900", currency_minor_unit: 2 }, permalink: "https://www.pv-24.at/x" }),
    );
    expect(result.offers[0]).toMatchObject({ status: "out_of_stock", priceCents: 108900 });
  });

  it("throws on an unexpected payload (no is_in_stock flag)", async () => {
    await expect(pv24Adapter.check(wooFetch({ error: "nope" }))).rejects.toThrow();
  });
});
