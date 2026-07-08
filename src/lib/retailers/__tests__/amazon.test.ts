import { describe, expect, it } from "vitest";
import { amazonAdapter, parseAmazon, parseEuroCents } from "@/lib/retailers/amazon";
import { fixture, fixtureFetch } from "./helpers";

describe("parseEuroCents (German number formatting)", () => {
  it.each([
    ["749,00 €", 74900],
    ["40,33€", 4033],
    ["1.799,00 €", 179900],
    ["1.234.567,89 €", 123456789],
    ["kostenlos", null],
    [undefined, null],
  ])("%s -> %s", (raw, expected) => {
    expect(parseEuroCents(raw as string | undefined)).toBe(expected);
  });
});

describe("parseAmazon", () => {
  it("in stock: featured offer present → in_stock + buy-box price", () => {
    expect(parseAmazon(fixture("amazon-pdp-instock-synthetic.html"))).toEqual({
      status: "in_stock",
      priceCents: 74900,
    });
  });

  it("out of stock: no featured offer → out_of_stock, and ignores the scalper price", () => {
    // The fixture has a €1.799 marketplace 'Collectible' offer that must NOT be picked up.
    expect(parseAmazon(fixture("amazon-pdp-oos-synthetic.html"))).toEqual({
      status: "out_of_stock",
      priceCents: null,
    });
  });

  it("throws on a blocked/CAPTCHA page (no productTitle) rather than reporting out_of_stock", () => {
    expect(() => parseAmazon("<html><body>Enter the characters you see below (robot check)</body></html>")).toThrow();
  });
});

describe("amazonAdapter", () => {
  // Minimal inline pages so tests can vary price/availability per colour ASIN.
  const inStock = (price: string) =>
    `<span id="productTitle">Midea PortaSplit</span><div id="corePrice_feature_div"><span class="a-offscreen">${price}</span></div><input id="add-to-cart-button">`;
  const outOfStock = `<span id="productTitle">Midea PortaSplit</span>Derzeit nicht verfügbar.`;

  it("has the right identity and is online-only", () => {
    expect(amazonAdapter.slug).toBe("amazon");
    expect(amazonAdapter.tier).toBe("slow");
  });

  it("marks portasplit available if EITHER colour has a featured offer (grey in, peach out)", async () => {
    const result = await amazonAdapter.check(
      fixtureFetch([
        ["/dp/B0GX16LKSC", outOfStock], // Pfirsich out
        ["/dp/B0D3PP64JS", inStock("749,00 €")], // Grau in
        ["/dp/B0GXDWTFR5", outOfStock], // Cool out
      ]),
    );
    expect(result.storeStock).toBeNull();
    expect(result.offers).toEqual([
      // links to the in-stock colour (grey)
      { variant: "portasplit", url: "https://www.amazon.de/dp/B0D3PP64JS", priceCents: 74900, status: "in_stock" },
      { variant: "portasplit-cool", url: "https://www.amazon.de/dp/B0GXDWTFR5", priceCents: null, status: "out_of_stock" },
    ]);
  });

  it("picks the cheapest in-stock colour for price + link", async () => {
    const result = await amazonAdapter.check(
      fixtureFetch([
        ["/dp/B0GX16LKSC", inStock("799,00 €")], // Pfirsich in, dearer
        ["/dp/B0D3PP64JS", inStock("749,00 €")], // Grau in, cheaper
        ["/dp/B0GXDWTFR5", outOfStock],
      ]),
    );
    const porta = result.offers.find((o) => o.variant === "portasplit")!;
    expect(porta).toEqual({ variant: "portasplit", url: "https://www.amazon.de/dp/B0D3PP64JS", priceCents: 74900, status: "in_stock" });
  });

  it("out of stock when all colours lack a featured offer → links to the primary colour", async () => {
    const result = await amazonAdapter.check(
      fixtureFetch([
        ["/dp/B0GX16LKSC", outOfStock],
        ["/dp/B0D3PP64JS", outOfStock],
        ["/dp/B0GXDWTFR5", outOfStock],
      ]),
    );
    expect(result.offers).toEqual([
      { variant: "portasplit", url: "https://www.amazon.de/dp/B0GX16LKSC", priceCents: null, status: "out_of_stock" },
      { variant: "portasplit-cool", url: "https://www.amazon.de/dp/B0GXDWTFR5", priceCents: null, status: "out_of_stock" },
    ]);
  });

  it("throws when Amazon serves a bot-check page", async () => {
    await expect(
      amazonAdapter.check(fixtureFetch([["/dp/", "<html><body>robot check</body></html>"]])),
    ).rejects.toThrow();
  });
});
