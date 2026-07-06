import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EmailSubscriptionEntity,
  NotificationLogEntity,
  OfferEntity,
  PushSubscriptionEntity,
  StoreEntity,
  type AppDb,
} from "@/db";
import { createTestDb } from "@/db/test-utils";
import { notifyEvents } from "@/lib/notify/orchestrator";
import type { StockEvent } from "@/lib/diff";

const RESTOCK: StockEvent = {
  type: "online_restock",
  retailerSlug: "obi",
  variantSlug: "portasplit",
  priceCents: 89999,
};

describe("notifyEvents", () => {
  let db: AppDb;
  const push = vi.fn().mockResolvedValue("sent");
  const email = vi.fn().mockResolvedValue("sent");
  const deps = { push, email };

  async function addPushSub(overrides: Partial<{ variantSlugs: string; zip: string | null; radiusKm: number | null; endpoint: string }> = {}) {
    await db.getRepository(PushSubscriptionEntity).insert({
      endpoint: overrides.endpoint ?? "https://push.example/1",
      p256dh: "k",
      auth: "a",
      variantSlugs: overrides.variantSlugs ?? JSON.stringify(["portasplit"]),
      zip: overrides.zip ?? null,
      radiusKm: overrides.radiusKm ?? null,
      createdAt: 1,
    });
  }

  async function addEmailSub(confirmed: boolean, variantSlugs = ["portasplit"]) {
    await db.getRepository(EmailSubscriptionEntity).insert({
      email: `${confirmed}@x.at`,
      confirmToken: "c" + String(confirmed),
      unsubscribeToken: "u" + String(confirmed),
      confirmed,
      variantSlugs: JSON.stringify(variantSlugs),
      zip: null,
      radiusKm: null,
      createdAt: 1,
    });
  }

  beforeEach(async () => {
    db = await createTestDb();
    push.mockClear();
    email.mockClear();
    await db.getRepository(OfferEntity).insert({
      retailerSlug: "obi",
      variantSlug: "portasplit",
      url: "https://www.obi.at/p/3586245/x",
      priceCents: 89999,
      status: "in_stock",
      pickupNote: null,
      lastCheckedAt: 0,
      lastChangedAt: 0,
    });
  });

  it("notifies matching push subscribers with German copy", async () => {
    await addPushSub();
    const stats = await notifyEvents(db, [RESTOCK], 1000, deps);
    expect(stats.pushed).toBe(1);
    const [, subId, payload] = push.mock.calls[0];
    expect(subId).toBe(1);
    expect(payload).toEqual({
      title: "🟢 Midea PortaSplit bestellbar!",
      body: "Jetzt bei OBI um 899,99 € bestellbar",
      url: "https://www.obi.at/p/3586245/x",
    });
  });

  it("skips subscribers of other variants", async () => {
    await addPushSub({ variantSlugs: JSON.stringify(["portasplit-cool"]) });
    const stats = await notifyEvents(db, [RESTOCK], 1000, deps);
    expect(stats.pushed).toBe(0);
  });

  it("ignores non-restock events", async () => {
    await addPushSub();
    const stats = await notifyEvents(
      db,
      [
        { type: "online_soldout", retailerSlug: "obi", variantSlug: "portasplit" },
        { type: "price_change", retailerSlug: "obi", variantSlug: "portasplit", priceCents: 1 },
        { type: "store_soldout", retailerSlug: "obi", variantSlug: "portasplit", storeExternalId: "002" },
      ],
      1000,
      deps,
    );
    expect(stats.pushed).toBe(0);
    expect(stats.emailed).toBe(0);
  });

  it("applies a 60-minute cooldown per subscriber and offer", async () => {
    await addPushSub();
    await notifyEvents(db, [RESTOCK], 1000, deps);
    await notifyEvents(db, [RESTOCK], 1000 + 30 * 60_000, deps);
    expect(push).toHaveBeenCalledTimes(1);
    await notifyEvents(db, [RESTOCK], 1000 + 61 * 60_000, deps);
    expect(push).toHaveBeenCalledTimes(2);
    expect(await db.getRepository(NotificationLogEntity).count()).toBe(2);
  });

  it("emails only confirmed subscriptions", async () => {
    await addEmailSub(true);
    await addEmailSub(false);
    const stats = await notifyEvents(db, [RESTOCK], 1000, deps);
    expect(stats.emailed).toBe(1);
    const [, , subject] = email.mock.calls[0];
    expect(subject).toContain("bestellbar");
  });

  it("store_restock notifies only subscribers within radius", async () => {
    // store in Vienna (1030), subscriber A in 1010 with 25km, subscriber B in Innsbruck 6020 with 25km, C without zip
    await db.getRepository(StoreEntity).insert({
      retailerSlug: "obi",
      externalId: "010",
      name: "Wien Triester",
      zip: "1100",
      city: "Wien",
      latE6: 48_180_000,
      lngE6: 16_360_000,
    });
    await addPushSub({ endpoint: "https://push.example/wien", zip: "1010", radiusKm: 25 });
    await addPushSub({ endpoint: "https://push.example/ibk", zip: "6020", radiusKm: 25 });
    await addPushSub({ endpoint: "https://push.example/nozip" });

    const event: StockEvent = {
      type: "store_restock",
      retailerSlug: "obi",
      variantSlug: "portasplit",
      storeExternalId: "010",
    };
    const stats = await notifyEvents(db, [event], 1000, deps);
    expect(stats.pushed).toBe(1);
    const [, subId, payload] = push.mock.calls[0];
    const sub = await db.getRepository(PushSubscriptionEntity).findOneByOrFail({ id: subId });
    expect(sub.endpoint).toBe("https://push.example/wien");
    expect(payload.title).toBe("🟢 Midea PortaSplit bestellbar!");
    expect(payload.body).toBe("Bei OBI Wien Triester (1100 Wien) verfügbar");
  });
});
