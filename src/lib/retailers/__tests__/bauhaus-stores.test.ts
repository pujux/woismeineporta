import { describe, expect, it, vi } from "vitest";
import { AdapterHttpError } from "@/lib/retailers/fetch";
import { fetchBauhausStoreStock, parseStock } from "@/lib/retailers/bauhaus-stores";

describe("parseStock (real api.bauhaus shape: {amount, availibility_level})", () => {
  it.each([
    [{ amount: 0, availibility_level: "OUT_OF_STOCK" }, false],
    [{ amount: 3, availibility_level: "IN_STOCK" }, true],
    [{ amount: 0, availibility_level: "IN_STOCK" }, true], // level fallback
    [{ amount: 0, availibility_level: "LOW_STOCK" }, true],
    [{ amount: 0, availibility_level: "LIMITED" }, true],
    [{ amount: 0, availibility_level: "OUT_OF_STOCK", extra: 1 }, false],
    [{}, false],
    [null, false],
  ])("%o -> %s", (body, expected) => {
    expect(parseStock(body)).toBe(expected);
  });
});

describe("fetchBauhausStoreStock", () => {
  it("sweeps every Fachcentrum with the apikey header and maps availability + geo", async () => {
    let n = 0;
    const fetchFn = vi.fn(async () => {
      const inStock = n++ < 2;
      return new Response(
        JSON.stringify({ amount: inStock ? 4 : 0, availibility_level: inStock ? "IN_STOCK" : "OUT_OF_STOCK" }),
        { status: 200 },
      );
    });

    const result = await fetchBauhausStoreStock(fetchFn as unknown as typeof fetch, "pubkey");
    expect(result.length).toBe(23); // all AT Fachcentren, geo resolved via PLZ
    expect(result.filter((s) => s.inStock)).toHaveLength(2);

    const sample = result[0];
    expect(sample.variant).toBe("portasplit");
    expect(sample.store.externalId).toMatch(/^\d+$/);
    expect(sample.store.lat).toBeGreaterThan(46);

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("/v1/product-stock/at/products/31934233/warehouses/");
    const h = new Headers(init.headers);
    expect(h.get("apikey")).toBe("pubkey");
    expect(h.get("origin")).toBe("https://www.bauhaus.at");
  });

  it("throws on 401/403 (apiKey rejected/rotated) so the adapter can degrade", async () => {
    const fetchFn = vi.fn(async () => new Response("nope", { status: 403 })) as unknown as typeof fetch;
    await expect(fetchBauhausStoreStock(fetchFn, "bad")).rejects.toBeInstanceOf(AdapterHttpError);
  });

  it("skips individual stores that error, keeps the rest", async () => {
    let n = 0;
    const fetchFn = vi.fn(async () =>
      n++ % 3 === 0
        ? new Response("err", { status: 500 })
        : new Response(JSON.stringify({ amount: 1, availibility_level: "IN_STOCK" }), { status: 200 }),
    ) as unknown as typeof fetch;
    const result = await fetchBauhausStoreStock(fetchFn, "pubkey");
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(23);
    expect(result.every((s) => s.inStock)).toBe(true);
  });
});
