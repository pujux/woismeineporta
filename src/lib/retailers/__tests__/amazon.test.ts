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
  it("has the right identity and is online-only", () => {
    expect(amazonAdapter.slug).toBe("amazon");
    expect(amazonAdapter.tier).toBe("slow");
  });

  it("parses both variants (portasplit in stock, cool out of stock)", async () => {
    const result = await amazonAdapter.check(
      fixtureFetch([
        ["/dp/B0GX16LKSC", fixture("amazon-pdp-instock-synthetic.html")],
        ["/dp/B0GXDWTFR5", fixture("amazon-pdp-oos-synthetic.html")],
      ]),
    );
    expect(result.retailerSlug).toBe("amazon");
    expect(result.storeStock).toBeNull();
    expect(result.offers).toEqual([
      { variant: "portasplit", url: "https://www.amazon.de/dp/B0GX16LKSC", priceCents: 74900, status: "in_stock" },
      { variant: "portasplit-cool", url: "https://www.amazon.de/dp/B0GXDWTFR5", priceCents: null, status: "out_of_stock" },
    ]);
  });

  it("throws when Amazon serves a bot-check page", async () => {
    await expect(
      amazonAdapter.check(fixtureFetch([["/dp/", "<html><body>robot check</body></html>"]])),
    ).rejects.toThrow();
  });
});
