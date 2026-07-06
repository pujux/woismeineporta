import { CheckRunEntity, EventEntity, type AppDb } from "@/db";
import { getDb } from "@/db";
import { computeDiff } from "./diff";
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
const EVENT_RETENTION_MS = 90 * 24 * 3600_000;
const CHECK_RUN_RETENTION_MS = 7 * 24 * 3600_000;

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
  const value = parseInt(process.env[name] ?? "", 10);
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

  if (++tickCounter % HOUSEKEEPING_EVERY === 0) {
    await db
      .getRepository(EventEntity)
      .createQueryBuilder()
      .delete()
      .where("created_at < :cutoff", { cutoff: now - EVENT_RETENTION_MS })
      .execute();
    await db
      .getRepository(CheckRunEntity)
      .createQueryBuilder()
      .delete()
      .where("started_at < :cutoff", { cutoff: now - CHECK_RUN_RETENTION_MS })
      .execute();
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
