import { CheckRunEntity, EmailSubscriptionEntity, EventEntity, NotificationLogEntity, type AppDb } from "@/db";
import { getDb } from "@/db";
import { computeDiff } from "./diff";
import { emitChange } from "./live-bus";
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
}

export type PollerState = Map<string, AdapterState>;

export function createPollerState(): PollerState {
  return new Map();
}

const MAX_BACKOFF_MS = 30 * 60_000;
const FAILURES_BEFORE_UNKNOWN = 3;
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
      st.consecutiveFailures = 0;
      st.backoffMs = 0;
      summary.ran.push(adapter.slug);
      summary.events += events.length;
    } catch (err) {
      st.consecutiveFailures++;
      summary.errors[adapter.slug] = String(err).slice(0, 300);
      if (err instanceof AdapterHttpError && (err.status === 403 || err.status === 429)) {
        st.backoffMs = Math.min(st.backoffMs > 0 ? st.backoffMs * 2 : interval * 2, MAX_BACKOFF_MS);
      }
      if (st.consecutiveFailures >= FAILURES_BEFORE_UNKNOWN) {
        await markUnknown(db, adapter.slug, now);
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
}
