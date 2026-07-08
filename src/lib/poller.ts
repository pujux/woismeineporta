import { CheckRunEntity, EmailSubscriptionEntity, EventEntity, NotificationLogEntity, type AppDb } from "@/db";
import { getDb } from "@/db";
import { checkCoverage } from "./coverage-watch";
import { computeDiff } from "./diff";
import { emitChange } from "./live-bus";
import { notifyOwner, type OwnerNotify } from "./notify/health";
import { notifyEvents } from "./notify/orchestrator";
import { AdapterHttpError } from "./retailers/fetch";
import { impitFetch } from "./retailers/impit-fetch";
import { adapters } from "./retailers/registry";
import type { RetailerAdapter } from "./retailers/types";
import { loadPrevState, markUnknown, persistResult } from "./state";

export interface TickSummary {
  ran: string[];
  events: number;
  errors: Record<string, string>;
  durationMs: number;
}

interface AdapterState {
  lastRunAt: number;
  consecutiveFailures: number;
  backoffMs: number;
  /** When the current failure streak started (undefined = healthy). */
  failingSince?: number;
  /** When we last emailed the owner about the current outage (for re-alert debounce). */
  alertedAt?: number;
}

export type PollerState = Map<string, AdapterState>;

export function createPollerState(): PollerState {
  return new Map();
}

const MAX_BACKOFF_MS = 30 * 60_000;
const FAILURES_BEFORE_UNKNOWN = 3;
// Once an adapter is flagged unhealthy, re-email the owner at most this often while
// it stays down (so a persistent outage nags but doesn't spam).
const HEALTH_REALERT_MS = 6 * 3_600_000;

function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} Min`;
  const h = Math.floor(min / 60);
  return `${h} Std ${min % 60} Min`;
}

function healthAlertHtml(slug: string, failures: number, failingSince: number, error: string, now: number): string {
  return `<p>Der Adapter <b>${slug}</b> liefert seit ${fmtDuration(now - failingSince)} keine Daten (${failures} Fehlversuche in Folge).</p>
    <p>Die Angebote wurden auf „unbekannt" gesetzt. Letzter Fehler:</p>
    <pre style="white-space:pre-wrap;font-size:12px;background:#f4f4f5;padding:8px;border-radius:6px">${error}</pre>`;
}
const HOUSEKEEPING_EVERY = 100;
const EVENT_RETENTION_MS = 90 * 24 * 3_600_000;
const CHECK_RUN_RETENTION_MS = 7 * 24 * 3_600_000;
// notification_log is only read within the 60-min cooldown window; a week gives
// debugging headroom. Unconfirmed email sign-ups that never opt in are dropped
// (housekeeping + no reason to retain unconfirmed addresses).
const NOTIFICATION_LOG_RETENTION_MS = 7 * 24 * 3_600_000;
const UNCONFIRMED_EMAIL_RETENTION_MS = 7 * 24 * 3_600_000;

/** Deletes rows past their retention. Safe to call any time; idempotent. */
export async function pruneOldData(db: AppDb, now: number): Promise<void> {
  const olderThan = (col: string, ms: number, extra = "") =>
    db
      .createQueryBuilder()
      .delete()
      .where(`${col} < :cutoff${extra ? ` AND ${extra}` : ""}`, { cutoff: now - ms });

  await olderThan("created_at", EVENT_RETENTION_MS).from(EventEntity).execute();
  await olderThan("started_at", CHECK_RUN_RETENTION_MS).from(CheckRunEntity).execute();
  await olderThan("sent_at", NOTIFICATION_LOG_RETENTION_MS).from(NotificationLogEntity).execute();
  await olderThan("created_at", UNCONFIRMED_EMAIL_RETENTION_MS, "confirmed = 0").from(EmailSubscriptionEntity).execute();
}

interface TickOptions {
  now: number;
  force?: boolean;
  adapterList?: RetailerAdapter[];
  fetchFn?: typeof fetch;
  notify?: typeof notifyEvents;
  ownerNotify?: OwnerNotify;
  state?: PollerState;
  fastMs?: number;
  slowMs?: number;
}

const globalState = createPollerState();
let tickCounter = 0;
let running = false;

function envInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function runTick(db: AppDb, opts: TickOptions): Promise<TickSummary> {
  const {
    now,
    force = false,
    adapterList = adapters,
    fetchFn = impitFetch,
    notify = notifyEvents,
    ownerNotify = notifyOwner,
    state = globalState,
    fastMs = envInt("POLL_FAST_MS", 30_000),
    slowMs = envInt("POLL_SLOW_MS", 180_000),
  } = opts;

  const summary: TickSummary = { ran: [], events: 0, errors: {}, durationMs: 0 };
  const started = Date.now();

  for (const adapter of adapterList) {
    const st = state.get(adapter.slug) ?? { lastRunAt: -Infinity, consecutiveFailures: 0, backoffMs: 0 };
    const interval = Math.max(adapter.tier === "fast" ? fastMs : slowMs, st.backoffMs);
    if (!force && now - st.lastRunAt < interval) continue;

    st.lastRunAt = now;
    try {
      const result = await adapter.check(fetchFn);
      const events = computeDiff(await loadPrevState(db, adapter.slug), result);
      await persistResult(db, result, events, now);
      await notify(db, events, now);
      // Recovered from an outage we'd alerted on → tell the owner it's back.
      if (st.alertedAt) {
        await ownerNotify(
          `✅ Adapter „${adapter.slug}" wieder ok`,
          `<p>Der Adapter <b>${adapter.slug}</b> liefert nach ${fmtDuration(now - (st.failingSince ?? now))} wieder Daten.</p>`,
        );
      }
      st.consecutiveFailures = 0;
      st.backoffMs = 0;
      st.failingSince = undefined;
      st.alertedAt = undefined;
      summary.ran.push(adapter.slug);
      summary.events += events.length;
    } catch (err) {
      st.consecutiveFailures++;
      if (st.consecutiveFailures === 1) st.failingSince = now;
      summary.errors[adapter.slug] = String(err).slice(0, 300);
      if (err instanceof AdapterHttpError && (err.status === 403 || err.status === 429)) {
        st.backoffMs = Math.min(st.backoffMs > 0 ? st.backoffMs * 2 : interval * 2, MAX_BACKOFF_MS);
      }
      if (st.consecutiveFailures >= FAILURES_BEFORE_UNKNOWN) {
        await markUnknown(db, adapter.slug, now);
        // Email the owner once per outage, then at most every HEALTH_REALERT_MS.
        if (st.alertedAt === undefined || now - st.alertedAt >= HEALTH_REALERT_MS) {
          st.alertedAt = now;
          await ownerNotify(
            `⚠️ Adapter „${adapter.slug}" liefert keine Daten`,
            healthAlertHtml(adapter.slug, st.consecutiveFailures, st.failingSince ?? now, summary.errors[adapter.slug], now),
          );
        }
      }
    }
    state.set(adapter.slug, st);
  }

  summary.durationMs = Date.now() - started;
  await db.getRepository(CheckRunEntity).insert({
    startedAt: now,
    durationMs: summary.durationMs,
    summary: JSON.stringify(summary),
  });

  // Nudge connected browsers to refresh — but only when something actually
  // changed. Timestamps tick client-side, so an unchanged tick needs no refresh.
  if (summary.events > 0) emitChange();

  if (++tickCounter % HOUSEKEEPING_EVERY === 0) {
    await pruneOldData(db, now);
  }

  return summary;
}

export function startPoller(): void {
  if (process.env.ENABLE_POLLER !== "1") return;
  const fastMs = envInt("POLL_FAST_MS", 30_000);
  console.log(`[poller] starting, tick every ${fastMs}ms`);

  const tick = async () => {
    if (running) return; // overlap guard
    running = true;
    try {
      const db = await getDb();
      const summary = await runTick(db, { now: Date.now() });
      if (summary.ran.length || Object.keys(summary.errors).length) {
        console.log(`[poller]`, JSON.stringify(summary));
      }
    } catch (err) {
      console.error("[poller] tick failed:", err);
    } finally {
      running = false;
    }
  };

  void tick();
  setInterval(tick, fastMs);

  // Coverage watch: wake hourly, but each shop is only re-checked once a day (gated
  // inside checkCoverage). Separate from the tick loop and prod-only.
  const coverage = async () => {
    try {
      await checkCoverage(await getDb(), impitFetch, notifyOwner, Date.now());
    } catch (err) {
      console.error("[coverage-watch] failed:", err);
    }
  };
  void coverage();
  setInterval(coverage, 3_600_000);
}
