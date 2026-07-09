import { describe, expect, it } from "vitest";
import { combineTimelines, computeTimeline, priceRange, type TimelineEvent } from "@/lib/stats";

// Work in small integer time units with 24 buckets over [0,24] → 1 unit per bucket.
const NOW = 24;
const SINCE = 0;
const B = 24;
const ev = (type: string, t: number, cents: number | null = null): TimelineEvent => ({ type, createdAt: t, priceCents: cents });
const availOf = (bs: { avail: number }[]) => bs.map((b) => b.avail);

describe("computeTimeline — availability", () => {
  it("no events, currently in stock → fully available", () => {
    const bs = computeTimeline([], { status: "in_stock", priceCents: null }, NOW, SINCE, B);
    expect(availOf(bs).every((a) => a === 1)).toBe(true);
  });

  it("no events, currently out → fully unavailable", () => {
    const bs = computeTimeline([], { status: "out_of_stock", priceCents: null }, NOW, SINCE, B);
    expect(availOf(bs).every((a) => a === 0)).toBe(true);
  });

  it("sold out mid-window → available before, gone after", () => {
    const bs = computeTimeline([ev("online_soldout", 12)], { status: "out_of_stock", priceCents: null }, NOW, SINCE, B);
    expect(bs.slice(0, 12).every((b) => b.avail === 1)).toBe(true);
    expect(bs.slice(12).every((b) => b.avail === 0)).toBe(true);
  });

  it("restock mid-window → unavailable before, available after", () => {
    const bs = computeTimeline([ev("online_restock", 6)], { status: "in_stock", priceCents: null }, NOW, SINCE, B);
    expect(bs.slice(0, 6).every((b) => b.avail === 0)).toBe(true);
    expect(bs.slice(6).every((b) => b.avail === 1)).toBe(true);
  });

  it("a partial bucket gets a fractional availability", () => {
    const bs = computeTimeline([ev("online_soldout", 12.5)], { status: "out_of_stock", priceCents: null }, NOW, SINCE, B);
    expect(bs[12].avail).toBeCloseTo(0.5, 5); // in stock for half of bucket [12,13]
  });
});

describe("computeTimeline — price forward-fill", () => {
  it("forward-fills the last known price and back-fills before the first", () => {
    const bs = computeTimeline(
      [ev("price_change", 6, 99900), ev("price_change", 18, 89900)],
      { status: "in_stock", priceCents: 89900 },
      NOW,
      SINCE,
      B,
    );
    expect(bs[0].priceCents).toBe(99900); // backfilled to the first known point
    expect(bs[10].priceCents).toBe(99900);
    expect(bs[20].priceCents).toBe(89900); // after the drop at t=18
  });

  it("null price when nothing is known", () => {
    const bs = computeTimeline([], { status: "unknown", priceCents: null }, NOW, SINCE, B);
    expect(bs.every((b) => b.priceCents === null)).toBe(true);
  });
});

describe("combineTimelines & priceRange", () => {
  it("combines to available-anywhere + cheapest price", () => {
    const a = [{ avail: 1, priceCents: 90000 }, { avail: 0, priceCents: 80000 }];
    const b = [{ avail: 0, priceCents: 70000 }, { avail: 0.5, priceCents: null }];
    expect(combineTimelines([a, b])).toEqual([
      { avail: 1, priceCents: 70000 },
      { avail: 0.5, priceCents: 80000 },
    ]);
  });

  it("priceRange returns min/max of non-null prices, or null", () => {
    expect(priceRange([{ avail: 1, priceCents: 74900 }, { avail: 0, priceCents: 99900 }, { avail: 0, priceCents: null }])).toEqual([74900, 99900]);
    expect(priceRange([{ avail: 0, priceCents: null }])).toBeNull();
  });
});
