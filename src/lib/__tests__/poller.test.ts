import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckRunEntity, OfferEntity, type AppDb } from "@/db";
import { createTestDb } from "@/db/test-utils";
import { AdapterHttpError } from "@/lib/retailers/fetch";
import type { RetailerAdapter, RetailerResult } from "@/lib/retailers/types";
import { createPollerState, runTick } from "@/lib/poller";

const okResult = (slug: string): RetailerResult => ({
  retailerSlug: slug,
  offers: [
    { variant: "portasplit", url: `https://${slug}.at/p`, priceCents: 89999, status: "in_stock" },
  ],
  storeStock: null,
});

function fakeAdapter(slug: string, tier: "fast" | "slow", impl?: () => Promise<RetailerResult>): RetailerAdapter & { check: ReturnType<typeof vi.fn> } {
  return {
    slug,
    tier,
    check: vi.fn(impl ?? (async () => okResult(slug))),
  } as never;
}

describe("runTick", () => {
  let db: AppDb;
  const notify = vi.fn().mockResolvedValue({ pushed: 0, emailed: 0 });

  beforeEach(async () => {
    db = await createTestDb();
    notify.mockClear();
  });

  it("runs due adapters by tier and skips not-yet-due ones", async () => {
    const fast = fakeAdapter("obi", "fast");
    const slow = fakeAdapter("tepto", "slow");
    const state = createPollerState();
    const opts = { adapterList: [fast, slow], notify, state, fastMs: 30_000, slowMs: 180_000 };

    const s1 = await runTick(db, { ...opts, now: 1_000_000 });
    expect(s1.ran.sort()).toEqual(["obi", "tepto"]); // first tick: everything due

    const s2 = await runTick(db, { ...opts, now: 1_000_000 + 35_000 });
    expect(s2.ran).toEqual(["obi"]); // slow not due yet

    const s3 = await runTick(db, { ...opts, now: 1_000_000 + 185_000 });
    expect(s3.ran.sort()).toEqual(["obi", "tepto"]);
  });

  it("force runs everything regardless of due-ness", async () => {
    const fast = fakeAdapter("obi", "fast");
    const state = createPollerState();
    const opts = { adapterList: [fast], notify, state, fastMs: 30_000, slowMs: 180_000 };
    await runTick(db, { ...opts, now: 1000 });
    const s = await runTick(db, { ...opts, now: 1001, force: true });
    expect(s.ran).toEqual(["obi"]);
  });

  it("persists results and calls notify with the diff events", async () => {
    const fast = fakeAdapter("obi", "fast");
    await runTick(db, { adapterList: [fast], notify, state: createPollerState(), now: 1000, fastMs: 30_000, slowMs: 180_000 });
    const offer = await db.getRepository(OfferEntity).findOneByOrFail({ retailerSlug: "obi" });
    expect(offer.status).toBe("in_stock");
    expect(notify).toHaveBeenCalledOnce();
    const [, events] = notify.mock.calls[0];
    expect(events.map((e: { type: string }) => e.type)).toEqual(["online_restock"]);
  });

  it("isolates adapter failures and records them in the summary", async () => {
    const bad = fakeAdapter("obi", "fast", async () => {
      throw new Error("boom");
    });
    const good = fakeAdapter("tepto", "fast");
    const s = await runTick(db, { adapterList: [bad, good], notify, state: createPollerState(), now: 1000, fastMs: 30_000, slowMs: 180_000 });
    expect(s.errors.obi).toContain("boom");
    expect(s.ran).toContain("tepto");
  });

  it("marks offers unknown only after 3 consecutive failures", async () => {
    const state = createPollerState();
    let fail = false;
    const flaky = fakeAdapter("obi", "fast", async () => {
      if (fail) throw new Error("down");
      return okResult("obi");
    });
    const opts = { adapterList: [flaky], notify, state, fastMs: 30_000, slowMs: 180_000 };

    await runTick(db, { ...opts, now: 0 }); // seeds in_stock
    fail = true;
    await runTick(db, { ...opts, now: 30_000 });
    await runTick(db, { ...opts, now: 60_000 });
    let offer = await db.getRepository(OfferEntity).findOneByOrFail({ retailerSlug: "obi" });
    expect(offer.status).toBe("in_stock"); // 2 failures: keep last state

    await runTick(db, { ...opts, now: 90_000 });
    offer = await db.getRepository(OfferEntity).findOneByOrFail({ retailerSlug: "obi" });
    expect(offer.status).toBe("unknown"); // 3rd failure
  });

  it("doubles the interval after 403/429 and resets on success", async () => {
    const state = createPollerState();
    let blocked = true;
    const adapter = fakeAdapter("obi", "fast", async () => {
      if (blocked) throw new AdapterHttpError(403, "https://obi.at");
      return okResult("obi");
    });
    const opts = { adapterList: [adapter], notify, state, fastMs: 30_000, slowMs: 180_000 };

    await runTick(db, { ...opts, now: 0 }); // fails -> backoff 60s
    const s35 = await runTick(db, { ...opts, now: 35_000 });
    expect(s35.errors.obi).toBeUndefined(); // 30s interval elapsed but backoff not: no attempt
    const s65 = await runTick(db, { ...opts, now: 65_000 });
    expect(s65.errors.obi).toBeDefined(); // attempted again, fails -> backoff 120s
    const s130 = await runTick(db, { ...opts, now: 130_000 });
    expect(s130.errors.obi).toBeUndefined(); // within doubled backoff: no attempt
    blocked = false;
    expect((await runTick(db, { ...opts, now: 190_000 })).ran).toEqual(["obi"]); // success resets
    expect((await runTick(db, { ...opts, now: 221_000 })).ran).toEqual(["obi"]); // normal 30s cadence again
  });

  it("writes a check_runs row per tick", async () => {
    await runTick(db, { adapterList: [fakeAdapter("obi", "fast")], notify, state: createPollerState(), now: 1000, fastMs: 30_000, slowMs: 180_000 });
    const runs = await db.getRepository(CheckRunEntity).find();
    expect(runs).toHaveLength(1);
    expect(JSON.parse(runs[0].summary).ran).toEqual(["obi"]);
  });
});
