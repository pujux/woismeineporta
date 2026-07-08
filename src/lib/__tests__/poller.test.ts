import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckRunEntity, EmailSubscriptionEntity, EventEntity, NotificationLogEntity, OfferEntity, type AppDb } from "@/db";
import { createTestDb } from "@/db/test-utils";
import { AdapterHttpError } from "@/lib/retailers/fetch";
import type { RetailerAdapter, RetailerResult } from "@/lib/retailers/types";
import { createPollerState, pruneOldData, runTick } from "@/lib/poller";

const okResult = (slug: string): RetailerResult => ({
  retailerSlug: slug,
  offers: [{ variant: "portasplit", url: `https://${slug}.at/p`, priceCents: 89999, status: "in_stock" }],
  storeStock: null,
});

function fakeAdapter(
  slug: string,
  tier: "fast" | "slow",
  impl?: () => Promise<RetailerResult>,
): RetailerAdapter & { check: ReturnType<typeof vi.fn> } {
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

  it("emits a live-bus change only when a tick produces events", async () => {
    const { liveBus } = await import("@/lib/live-bus");
    const state = createPollerState();
    const adapter = fakeAdapter("obi", "fast");
    const opts = { adapterList: [adapter], notify, state, fastMs: 30_000, slowMs: 180_000 };

    let fired = 0;
    const onChange = () => fired++;
    liveBus.on("change", onChange);

    await runTick(db, { ...opts, now: 1000 }); // unseen -> in_stock: online_restock event
    expect(fired).toBe(1);

    await runTick(db, { ...opts, now: 40_000 }); // same in_stock/price: no event
    expect(fired).toBe(1);

    liveBus.off("change", onChange);
  });

  it("pruneOldData drops expired rows and keeps recent ones", async () => {
    const now = 100 * 24 * 3600_000; // 100 days in
    const day = 24 * 3600_000;

    await db.getRepository(EventEntity).insert([
      { type: "online_restock", retailerSlug: "obi", variantSlug: "portasplit", storeId: null, priceCents: 1, createdAt: now - 91 * day },
      { type: "online_restock", retailerSlug: "obi", variantSlug: "portasplit", storeId: null, priceCents: 1, createdAt: now - 1 * day },
    ]);
    await db.getRepository(CheckRunEntity).insert([
      { startedAt: now - 8 * day, durationMs: 1, summary: "{}" },
      { startedAt: now - 1 * day, durationMs: 1, summary: "{}" },
    ]);
    await db.getRepository(NotificationLogEntity).insert([
      { channel: "push", subscriptionId: 1, dedupeKey: "k", sentAt: now - 8 * day },
      { channel: "push", subscriptionId: 1, dedupeKey: "k", sentAt: now - 1 * day },
    ]);
    await db.getRepository(EmailSubscriptionEntity).insert([
      {
        email: "stale@x.at",
        confirmToken: "a",
        unsubscribeToken: "b",
        confirmed: false,
        variantSlugs: "[]",
        zip: null,
        radiusKm: null,
        createdAt: now - 8 * day,
      },
      {
        email: "confirmed-old@x.at",
        confirmToken: "c",
        unsubscribeToken: "d",
        confirmed: true,
        variantSlugs: "[]",
        zip: null,
        radiusKm: null,
        createdAt: now - 8 * day,
      },
      {
        email: "fresh@x.at",
        confirmToken: "e",
        unsubscribeToken: "f",
        confirmed: false,
        variantSlugs: "[]",
        zip: null,
        radiusKm: null,
        createdAt: now - 1 * day,
      },
    ]);

    await pruneOldData(db, now);

    expect(await db.getRepository(EventEntity).count()).toBe(1);
    expect(await db.getRepository(CheckRunEntity).count()).toBe(1);
    expect(await db.getRepository(NotificationLogEntity).count()).toBe(1);
    // stale unconfirmed dropped; confirmed (any age) and fresh unconfirmed kept
    const emails = (await db.getRepository(EmailSubscriptionEntity).find()).map((e) => e.email).sort();
    expect(emails).toEqual(["confirmed-old@x.at", "fresh@x.at"]);
  });

  it("emails the owner when an adapter crosses the failure threshold, then on recovery", async () => {
    const state = createPollerState();
    const ownerNotify = vi.fn().mockResolvedValue(true);
    let fail = true;
    const flaky = fakeAdapter("obi", "fast", async () => {
      if (fail) throw new Error("down");
      return okResult("obi");
    });
    const opts = { adapterList: [flaky], notify, ownerNotify, state, fastMs: 30_000, slowMs: 180_000 };

    await runTick(db, { ...opts, now: 0 });
    await runTick(db, { ...opts, now: 30_000 });
    expect(ownerNotify).not.toHaveBeenCalled(); // 2 failures: not yet
    await runTick(db, { ...opts, now: 60_000 }); // 3rd failure → alert
    expect(ownerNotify).toHaveBeenCalledOnce();
    expect(ownerNotify.mock.calls[0][0]).toContain("obi");

    await runTick(db, { ...opts, now: 90_000 }); // still down, within re-alert window → no repeat
    expect(ownerNotify).toHaveBeenCalledOnce();

    fail = false;
    await runTick(db, { ...opts, now: 120_000 }); // recovered → one more (recovery) mail
    expect(ownerNotify).toHaveBeenCalledTimes(2);
    expect(ownerNotify.mock.calls[1][0]).toMatch(/ok|wieder/i);
  });

  it("re-alerts the owner after the re-alert window while still down", async () => {
    const state = createPollerState();
    const ownerNotify = vi.fn().mockResolvedValue(true);
    const dead = fakeAdapter("obi", "slow", async () => {
      throw new Error("down");
    });
    const sixHoursOneTick = 6 * 3_600_000 + 200_000;
    const opts = { adapterList: [dead], notify, ownerNotify, state, fastMs: 30_000, slowMs: 180_000 };

    await runTick(db, { ...opts, now: 0 });
    await runTick(db, { ...opts, now: 200_000 });
    await runTick(db, { ...opts, now: 400_000 }); // 3rd failure → first alert
    expect(ownerNotify).toHaveBeenCalledOnce();
    await runTick(db, { ...opts, now: 400_000 + sixHoursOneTick }); // past re-alert window
    expect(ownerNotify).toHaveBeenCalledTimes(2);
  });

  it("writes a check_runs row per tick", async () => {
    await runTick(db, { adapterList: [fakeAdapter("obi", "fast")], notify, state: createPollerState(), now: 1000, fastMs: 30_000, slowMs: 180_000 });
    const runs = await db.getRepository(CheckRunEntity).find();
    expect(runs).toHaveLength(1);
    expect(JSON.parse(runs[0].summary).ran).toEqual(["obi"]);
  });
});
