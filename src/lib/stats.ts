import type { StockStatus } from "./retailers/types";

const DAY_MS = 24 * 3_600_000;
export const TIMELINE_WINDOW_MS = 30 * DAY_MS;
export const TIMELINE_BUCKETS = 24;

export interface TimelineEvent {
  type: string; // online_restock | online_soldout | price_change
  priceCents: number | null;
  createdAt: number;
}

/** One column of the availability timeline. */
export interface TimelineBucket {
  /** Fraction of the bucket the offer was in stock (0–1). */
  avail: number;
  /** Forward-filled price at the bucket's end, or null if never priced. */
  priceCents: number | null;
}

/**
 * Reconstructs a bucketed availability + price timeline for one online offer over
 * [since, now]. Availability is integrated from restock/soldout transitions (state at
 * `since` seeded from the last transition before it, else the opposite of the first
 * future one, else the current status). Price is forward-filled from price_change events
 * (+ the current price). All shops share the same `since`/`buckets` so columns align.
 */
export function computeTimeline(
  events: TimelineEvent[],
  current: { status: StockStatus; priceCents: number | null },
  now: number,
  since: number,
  buckets: number = TIMELINE_BUCKETS,
): TimelineBucket[] {
  const bucketMs = Math.max(1, (now - since) / buckets);

  const avail = events
    .filter((e) => e.type === "online_restock" || e.type === "online_soldout")
    .sort((a, b) => a.createdAt - b.createdAt);

  // State at `since`.
  const before = avail.filter((e) => e.createdAt <= since);
  let inStock: boolean;
  if (before.length) inStock = before[before.length - 1].type === "online_restock";
  else if (avail.length) inStock = avail[0].type !== "online_restock"; // opposite of the first future transition
  else inStock = current.status === "in_stock";

  // In-stock intervals across [since, now].
  const transitions = avail.filter((e) => e.createdAt > since && e.createdAt <= now);
  const intervals: Array<{ start: number; end: number; inStock: boolean }> = [];
  let start = since;
  let state = inStock;
  for (const t of transitions) {
    intervals.push({ start, end: t.createdAt, inStock: state });
    state = t.type === "online_restock";
    start = t.createdAt;
  }
  intervals.push({ start, end: now, inStock: state });

  // Forward-filled price lookup.
  const pts: Array<[number, number]> = [];
  for (const e of events) if (e.type === "price_change" && typeof e.priceCents === "number") pts.push([e.createdAt, e.priceCents]);
  if (typeof current.priceCents === "number") pts.push([now, current.priceCents]);
  pts.sort((a, b) => a[0] - b[0]);
  const priceAt = (t: number): number | null => {
    if (!pts.length) return null;
    let v = pts[0][1]; // backfill before the first known point
    for (const [pt, pc] of pts) {
      if (pt <= t) v = pc;
      else break;
    }
    return v;
  };

  const out: TimelineBucket[] = [];
  for (let i = 0; i < buckets; i++) {
    const b0 = since + i * bucketMs;
    const b1 = since + (i + 1) * bucketMs;
    let inMs = 0;
    for (const iv of intervals) {
      if (!iv.inStock) continue;
      inMs += Math.max(0, Math.min(b1, iv.end) - Math.max(b0, iv.start));
    }
    out.push({ avail: Math.min(1, Math.max(0, inMs / bucketMs)), priceCents: priceAt(b1) });
  }
  return out;
}

/** Combines per-shop timelines into an "all shops" series: available anywhere, cheapest price. */
export function combineTimelines(series: TimelineBucket[][]): TimelineBucket[] {
  if (series.length === 0) return [];
  const n = series[0].length;
  const out: TimelineBucket[] = [];
  for (let i = 0; i < n; i++) {
    let avail = 0;
    let priceCents: number | null = null;
    for (const s of series) {
      avail = Math.max(avail, s[i]?.avail ?? 0);
      const p = s[i]?.priceCents;
      if (typeof p === "number") priceCents = priceCents === null ? p : Math.min(priceCents, p);
    }
    out.push({ avail, priceCents });
  }
  return out;
}

/** Min/max of the non-null prices in a series, for the "Preis: X–Y" legend. */
export function priceRange(buckets: TimelineBucket[]): [number, number] | null {
  const ps = buckets.map((b) => b.priceCents).filter((p): p is number => typeof p === "number");
  return ps.length ? [Math.min(...ps), Math.max(...ps)] : null;
}
