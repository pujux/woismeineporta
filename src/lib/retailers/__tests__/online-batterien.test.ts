import { describe, expect, it, vi } from "vitest";
import { mapMicrodataAvailability, onlineBatterienAdapter, parseOnlineBatterien } from "@/lib/retailers/online-batterien";

const URL = "https://online-batterien.at/17837/midea-portasplit-klimageraet-diy-mobile-split-klimaanlage-12k-eek-a/a";

// Minimal microdata matching the real Gambio Offer markup.
const page = (availability: string, price = "1106.71") =>
  `<div itemscope itemtype="https://schema.org/Offer">
     <meta itemprop="priceCurrency" content="EUR"/>
     <meta itemprop="price" content="${price}">
     <link itemprop="availability" href="http://schema.org/${availability}">
   </div>`;

describe("mapMicrodataAvailability", () => {
  it.each([
    ["InStock", "in_stock"],
    ["LimitedAvailability", "in_stock"],
    ["OutOfStock", "out_of_stock"],
    ["SoldOut", "out_of_stock"],
    ["PreOrder", "out_of_stock"], // pre-order is not immediate availability
    ["BackOrder", "out_of_stock"],
    ["Frobnicated", "unknown"],
    [undefined, "unknown"],
  ])("%s -> %s", (name, expected) => {
    expect(mapMicrodataAvailability(name as string | undefined)).toBe(expected);
  });
});

describe("parseOnlineBatterien", () => {
  it("reads price + availability from schema.org microdata (in stock)", () => {
    expect(parseOnlineBatterien(page("InStock", "1106.71"))).toEqual({
      variant: "portasplit",
      url: URL,
      priceCents: 110671,
      status: "in_stock",
    });
  });

  it("maps a PreOrder offer to out_of_stock (keeps the price)", () => {
    expect(parseOnlineBatterien(page("PreOrder"))).toMatchObject({ status: "out_of_stock", priceCents: 110671 });
  });

  it("throws when the Offer microdata is absent (blocked / layout change)", () => {
    expect(() => parseOnlineBatterien("<html><body>nichts</body></html>")).toThrow();
  });
});

describe("onlineBatterienAdapter", () => {
  it("is online-only on the slow tier and parses the PDP", async () => {
    expect(onlineBatterienAdapter.slug).toBe("online-batterien");
    expect(onlineBatterienAdapter.tier).toBe("slow");
    const fetchFn = vi.fn(async () => new Response(page("OutOfStock"), { status: 200 })) as unknown as typeof fetch;
    const result = await onlineBatterienAdapter.check(fetchFn);
    expect(result.storeStock).toBeNull();
    expect(result.offers[0]).toMatchObject({ variant: "portasplit", status: "out_of_stock", priceCents: 110671 });
  });
});
