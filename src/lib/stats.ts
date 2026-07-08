import type { StockStatus } from "./retailers/types";

const DAY_MS = 24 * 3_600_000;
export const HISTORY_WINDOW_MS = 30 * DAY_MS;

export interface HistoryEvent {
  type: string; // online_restock | online_soldout | price_change
  priceCents: number | null;
  createdAt: number;
}

export interface OfferHistory {
  /** Last moment the offer was orderable (now if currently in stock), or null. */
  lastInStockAt: number | null;
  /** Number of times it came back in stock within the window. */
  restockCount: number;
  /** Fraction of the *observed* span it was in stock (0–100), or null if too thin. */
  uptimePct: number | null;
  /** How many days of history the uptime covers (≤ window). */
  observedDays: number;
  /** Price series in cents, oldest→newest, for the sparkline (empty/1 = no line). */
  pricePoints: number[];
}

/**
 * Reconstructs availability + price history for one online offer from its event log.
 * Approximate by design (events are transitions, not snapshots): uptime is measured
 * from the first transition in the window — the earliest point we can *know* the state —
 * so a fresh deployment reports a short observed span rather than a misleading full one.
 */
export function computeOfferHistory(
  events: HistoryEvent[],
  current: { status: StockStatus; priceCents: number | null; lastChangedAt: number },
  now: number,
  windowMs: number = HISTORY_WINDOW_MS,
): OfferHistory {
  const windowStart = now - windowMs;
  const inWindow = events
    .filter((e) => e.createdAt >= windowStart && e.createdAt <= now)
    .sort((a, b) => a.createdAt - b.createdAt);

  const avail = inWindow.filter((e) => e.type === "online_restock" || e.type === "online_soldout");
  const restockCount = avail.filter((e) => e.type === "online_restock").length;

  // Last in-stock moment: now if currently in stock, else the most recent sell-out
  // (it was available up until then). Null if never observed in stock in the window.
  let lastInStockAt: number | null = null;
  if (current.status === "in_stock") {
    lastInStockAt = now;
  } else {
    for (let i = avail.length - 1; i >= 0; i--) {
      if (avail[i].type === "online_soldout") {
        lastInStockAt = avail[i].createdAt;
        break;
      }
    }
  }

  // Uptime over the observed span.
  let uptimePct: number | null = null;
  let observedDays = 0;
  if (avail.length === 0) {
    // No transitions: if the current state has held since before the window and is known,
    // the whole window was that state; otherwise we can't say.
    if (current.status !== "unknown" && current.lastChangedAt > 0 && current.lastChangedAt <= windowStart) {
      uptimePct = current.status === "in_stock" ? 100 : 0;
      observedDays = windowMs / DAY_MS;
    }
  } else {
    const obsStart = avail[0].createdAt;
    let cursor = obsStart;
    let inStock = avail[0].type === "online_restock"; // state right AFTER the first transition
    let inMs = 0;
    for (let i = 1; i < avail.length; i++) {
      if (inStock) inMs += avail[i].createdAt - cursor;
      cursor = avail[i].createdAt;
      inStock = avail[i].type === "online_restock";
    }
    if (inStock) inMs += now - cursor;
    const span = now - obsStart;
    if (span > 0) {
      uptimePct = (inMs / span) * 100;
      observedDays = span / DAY_MS;
    }
  }

  // Price series: each recorded price change (carries the new price) + the current price,
  // oldest→newest, collapsing consecutive duplicates.
  const priceEvents = inWindow.filter((e) => e.type === "price_change" && typeof e.priceCents === "number");
  const raw = [...priceEvents.map((e) => e.priceCents as number)];
  if (typeof current.priceCents === "number") raw.push(current.priceCents);
  const pricePoints: number[] = [];
  for (const p of raw) if (pricePoints[pricePoints.length - 1] !== p) pricePoints.push(p);

  return { lastInStockAt, restockCount, uptimePct, observedDays, pricePoints };
}
