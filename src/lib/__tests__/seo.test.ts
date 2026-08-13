import { describe, expect, it } from "vitest";
import { FAQ_ITEMS } from "@/data/product-content";
import { buildFaqJsonLd, buildProductJsonLd, jsonLdScript } from "@/lib/seo";
import type { VariantStatus } from "@/lib/queries";

const statuses: VariantStatus[] = [
  {
    variant: { slug: "portasplit", name: "Midea PortaSplit", uvpCents: 119900 },
    offers: [
      { retailerSlug: "obi", retailerName: "OBI", url: "https://obi.at/p", priceCents: 89999, status: "in_stock", pickupNote: null, lastCheckedAt: 0, lastChangedAt: 0 },
      { retailerSlug: "bauhaus", retailerName: "BAUHAUS", url: "https://bauhaus.at/p", priceCents: 99900, status: "out_of_stock", pickupNote: null, lastCheckedAt: 0, lastChangedAt: 0 },
    ],
  },
  {
    variant: { slug: "portasplit-cool", name: "Midea PortaSplit Cool", uvpCents: 89900 },
    offers: [],
  },
];

describe("buildProductJsonLd", () => {
  const [ps, cool] = buildProductJsonLd(statuses, "https://woismeineporta.at");

  it("emits one Product per variant with brand + description", () => {
    expect(ps["@type"]).toBe("Product");
    expect(ps.name).toBe("Midea PortaSplit");
    expect(ps.brand).toEqual({ "@type": "Brand", name: "Midea" });
    expect(ps.description).toContain("Split");
    expect(ps.url).toBe("https://woismeineporta.at");
  });

  it("aggregates priced offers with retailer sellers and availability", () => {
    const agg = ps.offers as Record<string, unknown>;
    expect(agg["@type"]).toBe("AggregateOffer");
    expect(agg.lowPrice).toBe("899.99");
    expect(agg.highPrice).toBe("999.00");
    expect(agg.offerCount).toBe(2);
    const offers = agg.offers as Record<string, unknown>[];
    expect(offers[0]).toMatchObject({
      "@type": "Offer",
      url: "https://obi.at/p",
      price: "899.99",
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: "OBI" },
    });
    expect(offers[1].availability).toBe("https://schema.org/OutOfStock");
  });

  it("omits offers entirely when a variant has none", () => {
    expect(cool.offers).toBeUndefined();
  });
});

describe("buildFaqJsonLd", () => {
  it("wraps every FAQ item as a Question/Answer", () => {
    const faq = buildFaqJsonLd(FAQ_ITEMS);
    expect(faq["@type"]).toBe("FAQPage");
    const main = faq.mainEntity as Record<string, unknown>[];
    expect(main).toHaveLength(FAQ_ITEMS.length);
    expect(main[0]).toMatchObject({
      "@type": "Question",
      name: FAQ_ITEMS[0].question,
      acceptedAnswer: { "@type": "Answer", text: FAQ_ITEMS[0].answer },
    });
  });
});

describe("jsonLdScript", () => {
  it("escapes < to prevent breaking out of the script tag", () => {
    expect(jsonLdScript({ x: "</script><b>" })).toBe('{"x":"\\u003c/script>\\u003cb>"}');
  });
});
