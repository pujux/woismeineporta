import { describe, expect, it, vi } from "vitest";
import { AdapterHttpError } from "@/lib/retailers/fetch";
import { fetchBauhausStoreStock, parseStock } from "@/lib/retailers/bauhaus-stores";

describe("parseStock (defensive — shape unverified against live API)", () => {
  it.each([
    [{ availableQuantity: 3 }, true],
    [{ availableQuantity: 0 }, false],
    [{ stockLevel: 5 }, true],
    [{ quantity: 2 }, true],
    [{ available: true }, true],
    [{ available: false }, false],
    [{ inStock: true }, true],
    [{}, false],
    [null, false],
  ])("%o -> %s", (body, expected) => {
    expect(parseStock(body)).toBe(expected);
  });
});

describe("fetchBauhausStoreStock", () => {
  it("queries every Fachcentrum and maps availability + geo", async () => {
    // Every warehouse: first two in stock, rest out.
    let n = 0;
    const fetchFn = vi.fn(async () => {
      const qty = n++ < 2 ? 4 : 0;
      return new Response(JSON.stringify({ availableQuantity: qty }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await fetchBauhausStoreStock(fetchFn, "tok");
    expect(result.length).toBe(23); // all AT Fachcentren, geo resolved via PLZ
    expect(result.filter((s) => s.inStock)).toHaveLength(2);

    const sample = result[0];
    expect(sample.variant).toBe("portasplit");
    expect(sample.store.externalId).toMatch(/^\d+$/);
    expect(sample.store.lat).toBeGreaterThan(46);
    expect(sample.store.lng).toBeGreaterThan(9);

    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain("/v1/product-stock/at/products/31934233/warehouses/");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
  });

  it("throws on a 401 so the caller can refresh the token", async () => {
    const fetchFn = vi.fn(async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(fetchBauhausStoreStock(fetchFn, "expired")).rejects.toBeInstanceOf(AdapterHttpError);
  });

  it("skips individual stores that error, keeps the rest", async () => {
    let n = 0;
    const fetchFn = vi.fn(async () => {
      // every 3rd store 500s; others return in stock
      return n++ % 3 === 0
        ? new Response("err", { status: 500 })
        : new Response(JSON.stringify({ available: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await fetchBauhausStoreStock(fetchFn, "tok");
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(23);
    expect(result.every((s) => s.inStock)).toBe(true);
  });
});
