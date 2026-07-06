import { describe, expect, it } from "vitest";
import { computeDiff, type PrevState } from "@/lib/diff";
import type { RetailerResult, StoreStock } from "@/lib/retailers/types";

const store = (externalId: string): StoreStock["store"] => ({
  externalId,
  name: `Store ${externalId}`,
  zip: "1010",
  city: "Wien",
  lat: 48.2,
  lng: 16.37,
});

function prev(init?: Partial<PrevState>): PrevState {
  return { offers: new Map(), storeStock: new Map(), ...init };
}

function result(overrides: Partial<RetailerResult>): RetailerResult {
  return { retailerSlug: "obi", offers: [], storeStock: null, ...overrides };
}

describe("computeDiff — online offers", () => {
  const offer = (status: "in_stock" | "out_of_stock" | "unknown", priceCents: number | null = 89999) => ({
    variant: "portasplit" as const,
    url: "https://example.at/p",
    priceCents,
    status,
  });

  it.each([
    ["out_of_stock", "online_restock"],
    ["unknown", "online_restock"],
  ] as const)("%s -> in_stock emits %s", (from, expected) => {
    const p = prev({ offers: new Map([["portasplit", { status: from, priceCents: 89999 }]]) });
    const events = computeDiff(p, result({ offers: [offer("in_stock")] }));
    expect(events).toEqual([
      { type: expected, retailerSlug: "obi", variantSlug: "portasplit", priceCents: 89999 },
    ]);
  });

  it("in_stock -> out_of_stock emits online_soldout", () => {
    const p = prev({ offers: new Map([["portasplit", { status: "in_stock", priceCents: 89999 }]]) });
    const events = computeDiff(p, result({ offers: [offer("out_of_stock")] }));
    expect(events).toEqual([
      { type: "online_soldout", retailerSlug: "obi", variantSlug: "portasplit", priceCents: 89999 },
    ]);
  });

  it("price change while in stock emits price_change only", () => {
    const p = prev({ offers: new Map([["portasplit", { status: "in_stock", priceCents: 89999 }]]) });
    const events = computeDiff(p, result({ offers: [offer("in_stock", 79999)] }));
    expect(events).toEqual([
      { type: "price_change", retailerSlug: "obi", variantSlug: "portasplit", priceCents: 79999 },
    ]);
  });

  it("unseen offer arriving in stock emits online_restock", () => {
    const events = computeDiff(prev(), result({ offers: [offer("in_stock")] }));
    expect(events.map((e) => e.type)).toEqual(["online_restock"]);
  });

  it("unseen offer arriving out of stock emits nothing", () => {
    expect(computeDiff(prev(), result({ offers: [offer("out_of_stock")] }))).toEqual([]);
  });

  it("no change emits nothing", () => {
    const p = prev({ offers: new Map([["portasplit", { status: "in_stock", priceCents: 89999 }]]) });
    expect(computeDiff(p, result({ offers: [offer("in_stock")] }))).toEqual([]);
  });

  it("in_stock -> unknown emits nothing", () => {
    const p = prev({ offers: new Map([["portasplit", { status: "in_stock", priceCents: 89999 }]]) });
    expect(computeDiff(p, result({ offers: [offer("unknown")] }))).toEqual([]);
  });
});

describe("computeDiff — store stock", () => {
  it("false -> true emits store_restock, true -> false emits store_soldout", () => {
    const p = prev({
      storeStock: new Map([
        ["001:portasplit", false],
        ["002:portasplit", true],
      ]),
    });
    const events = computeDiff(
      p,
      result({
        storeStock: [
          { store: store("001"), variant: "portasplit", inStock: true },
          { store: store("002"), variant: "portasplit", inStock: false },
        ],
      }),
    );
    expect(events).toEqual([
      { type: "store_restock", retailerSlug: "obi", variantSlug: "portasplit", storeExternalId: "001" },
      { type: "store_soldout", retailerSlug: "obi", variantSlug: "portasplit", storeExternalId: "002" },
    ]);
  });

  it("unseen store in stock emits store_restock, out of stock emits nothing", () => {
    const events = computeDiff(
      prev(),
      result({
        storeStock: [
          { store: store("001"), variant: "portasplit", inStock: true },
          { store: store("002"), variant: "portasplit", inStock: false },
        ],
      }),
    );
    expect(events.map((e) => e.type)).toEqual(["store_restock"]);
  });

  it("storeStock null emits no store events", () => {
    const p = prev({ storeStock: new Map([["001:portasplit", true]]) });
    expect(computeDiff(p, result({ storeStock: null }))).toEqual([]);
  });
});
