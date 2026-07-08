import { afterEach, describe, expect, it, vi } from "vitest";
import { teptoAdapter } from "@/lib/retailers/tepto";
import { bauhausAdapter } from "@/lib/retailers/bauhaus";
import { fixture, fixtureFetch } from "./helpers";

const IN_STOCK = JSON.stringify({ amount: 5, availibility_level: "SOME" });
const OUT_OF_STOCK = JSON.stringify({ amount: 0, availibility_level: "OUT_OF_STOCK" });

describe("teptoAdapter", () => {
  it("parses the base variant from the PDP fixture", async () => {
    const result = await teptoAdapter.check(fixtureFetch([["tepto.at", fixture("tepto-pdp-portasplit.html")]]));
    expect(result.retailerSlug).toBe("tepto");
    expect(teptoAdapter.tier).toBe("slow");
    expect(result.storeStock).toBeNull();
    expect(result.offers).toEqual([
      {
        variant: "portasplit",
        url: "https://www.tepto.at/Midea-Klimageraet-PortaSplit",
        priceCents: 82679,
        status: "out_of_stock", // SoldOut
      },
    ]);
  });

  it("throws on server error", async () => {
    await expect(teptoAdapter.check(fixtureFetch([["tepto.at", "oops", 500]]))).rejects.toMatchObject({ status: 500 });
  });
});

describe("bauhausAdapter", () => {
  afterEach(() => {
    delete process.env.BAUHAUS_API_KEY;
  });

  it("takes price from the PDP but online status from api.bauhaus (which wins)", async () => {
    // The synthetic PDP fixture's JSON-LD says out_of_stock; api.bauhaus says in stock.
    // api.bauhaus is the authoritative real-time signal, so the status must be in_stock.
    const result = await bauhausAdapter.check(
      fixtureFetch([
        ["api.bauhaus", IN_STOCK],
        ["bauhaus.at", fixture("bauhaus-pdp-portasplit-synthetic.html")],
      ]),
    );
    expect(bauhausAdapter.tier).toBe("slow");
    expect(result.offers).toEqual([
      {
        variant: "portasplit",
        url: "https://www.bauhaus.at/klimaanlagen/midea-klimasplitgeraet-portasplit-12000-btu/p/31934233",
        priceCents: 74900,
        status: "in_stock",
      },
    ]);
    expect(result.storeStock).toHaveLength(23);
  });

  it("skips the PDP entirely when BAUHAUS_API_KEY is set — status, stores AND price from api.bauhaus", async () => {
    process.env.BAUHAUS_API_KEY = "envkey";
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("www.bauhaus.at")) throw new Error("PDP must not be fetched when BAUHAUS_API_KEY is set");
      // Price comes from the recommendation widget: hop 1 seeds our product (→ accessory),
      // hop 2 seeds the accessory whose recommendations include us with priceInfo.
      if (url.includes("product-recommendation")) {
        const results = url.includes("product-id=31934233")
          ? [{ id: "ACC1" }]
          : [{ id: "31934233", metadata: { product: { priceInfo: { price: 749 } } } }];
        return new Response(JSON.stringify([{ results }]), { status: 200 });
      }
      return new Response(OUT_OF_STOCK, { status: 200 }); // online + per-store
    }) as unknown as typeof fetch;

    const result = await bauhausAdapter.check(fetchFn);
    expect(result.offers).toEqual([
      {
        variant: "portasplit",
        url: "https://www.bauhaus.at/klimaanlagen/midea-klimasplitgeraet-portasplit-12000-btu/p/31934233",
        priceCents: 74900,
        status: "out_of_stock",
      },
    ]);
    expect(result.storeStock).toHaveLength(23);
  });

  it("throws AdapterHttpError on the usual Cloudflare 403 (no key configured)", async () => {
    await expect(bauhausAdapter.check(fixtureFetch([["bauhaus.at", "Sicherheitsprüfung", 403]]))).rejects.toMatchObject({
      name: "AdapterHttpError",
      status: 403,
    });
  });
});
