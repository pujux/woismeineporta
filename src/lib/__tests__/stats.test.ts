import { describe, expect, it } from "vitest";
import { computeOfferHistory, type HistoryEvent } from "@/lib/stats";

const DAY = 24 * 3_600_000;
const NOW = 1000 * DAY;
const restock = (daysAgo: number): HistoryEvent => ({ type: "online_restock", priceCents: null, createdAt: NOW - daysAgo * DAY });
const soldout = (daysAgo: number): HistoryEvent => ({ type: "online_soldout", priceCents: null, createdAt: NOW - daysAgo * DAY });
const priceChange = (daysAgo: number, cents: number): HistoryEvent => ({ type: "price_change", priceCents: cents, createdAt: NOW - daysAgo * DAY });

describe("computeOfferHistory", () => {
  it("currently in stock → lastInStockAt is now, counts restocks", () => {
    const h = computeOfferHistory([restock(5)], { status: "in_stock", priceCents: 74900, lastChangedAt: NOW - 5 * DAY }, NOW);
    expect(h.lastInStockAt).toBe(NOW);
    expect(h.restockCount).toBe(1);
    expect(h.uptimePct).toBe(100); // in stock the whole 5-day observed span
    expect(h.observedDays).toBeCloseTo(5, 5);
  });

  it("out of stock with a restock→soldout cycle → uptime over observed span, last-in-stock at the sell-out", () => {
    const h = computeOfferHistory([restock(10), soldout(6)], { status: "out_of_stock", priceCents: 74900, lastChangedAt: NOW - 6 * DAY }, NOW);
    expect(h.lastInStockAt).toBe(NOW - 6 * DAY);
    expect(h.restockCount).toBe(1);
    expect(h.uptimePct).toBeCloseTo(40, 5); // in stock 4 of the 10 observed days
    expect(h.observedDays).toBeCloseTo(10, 5);
  });

  it("no events but stable-in-stock since before the window → 100% over full window", () => {
    const h = computeOfferHistory([], { status: "in_stock", priceCents: 74900, lastChangedAt: NOW - 40 * DAY }, NOW);
    expect(h.uptimePct).toBe(100);
    expect(h.observedDays).toBeCloseTo(30, 5);
    expect(h.lastInStockAt).toBe(NOW);
  });

  it("no events and unknown status → uptime null (can't say)", () => {
    const h = computeOfferHistory([], { status: "unknown", priceCents: null, lastChangedAt: 0 }, NOW);
    expect(h.uptimePct).toBeNull();
    expect(h.observedDays).toBe(0);
    expect(h.lastInStockAt).toBeNull();
    expect(h.pricePoints).toEqual([]);
  });

  it("builds a deduped price series and ignores events outside the window", () => {
    const h = computeOfferHistory(
      [priceChange(40, 99900), priceChange(20, 79900), priceChange(10, 74900), priceChange(2, 74900)],
      { status: "in_stock", priceCents: 74900, lastChangedAt: NOW - 2 * DAY },
      NOW,
    );
    expect(h.pricePoints).toEqual([79900, 74900]); // -40d excluded, consecutive dupes collapsed
  });

  it("excludes availability events older than the window", () => {
    const h = computeOfferHistory([restock(40), soldout(35)], { status: "out_of_stock", priceCents: null, lastChangedAt: NOW - 35 * DAY }, NOW);
    expect(h.restockCount).toBe(0); // both transitions predate the 30-day window
    expect(h.uptimePct).toBe(0); // out since before the window → out the whole window
    expect(h.lastInStockAt).toBeNull();
  });
});
