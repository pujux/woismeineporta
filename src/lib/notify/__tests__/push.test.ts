import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, PushSubscriptionEntity, type AppDb } from "@/db";
import { sendPush, upsertPushSubscription, validatePushInput } from "@/lib/notify/push";

async function insertSub(db: AppDb) {
  await db.getRepository(PushSubscriptionEntity).insert({
    endpoint: "https://push.example/abc",
    p256dh: "key",
    auth: "auth",
    variantSlugs: JSON.stringify(["portasplit"]),
    zip: null,
    radiusKm: null,
    createdAt: 1,
  });
  return db.getRepository(PushSubscriptionEntity).findOneByOrFail({ endpoint: "https://push.example/abc" });
}

describe("sendPush", () => {
  let db: AppDb;
  beforeEach(async () => {
    db = await createDb(":memory:");
  });

  it("returns sent on success", async () => {
    const sub = await insertSub(db);
    const impl = { sendNotification: vi.fn().mockResolvedValue({ statusCode: 201 }) };
    const result = await sendPush(db, sub.id, { title: "t", body: "b", url: "u" }, impl);
    expect(result).toBe("sent");
    const [target, payload] = impl.sendNotification.mock.calls[0];
    expect(target.endpoint).toBe("https://push.example/abc");
    expect(JSON.parse(payload)).toEqual({ title: "t", body: "b", url: "u" });
  });

  it("deletes the subscription and returns gone on 410", async () => {
    const sub = await insertSub(db);
    const impl = { sendNotification: vi.fn().mockRejectedValue({ statusCode: 410 }) };
    expect(await sendPush(db, sub.id, { title: "t", body: "b", url: "u" }, impl)).toBe("gone");
    expect(await db.getRepository(PushSubscriptionEntity).count()).toBe(0);
  });

  it("keeps the subscription and returns failed on other errors", async () => {
    const sub = await insertSub(db);
    const impl = { sendNotification: vi.fn().mockRejectedValue(new Error("boom")) };
    expect(await sendPush(db, sub.id, { title: "t", body: "b", url: "u" }, impl)).toBe("failed");
    expect(await db.getRepository(PushSubscriptionEntity).count()).toBe(1);
  });
});

describe("validatePushInput", () => {
  const valid = {
    endpoint: "https://push.example/abc",
    keys: { p256dh: "k", auth: "a" },
    variantSlugs: ["portasplit"],
  };

  it("accepts a valid payload", () => {
    expect(validatePushInput(valid)).not.toBeNull();
  });

  it("accepts zip + radius", () => {
    expect(validatePushInput({ ...valid, zip: "1010", radiusKm: 50 })).not.toBeNull();
  });

  it.each([
    ["missing endpoint", { ...valid, endpoint: undefined }],
    ["bad variant", { ...valid, variantSlugs: ["nope"] }],
    ["empty variants", { ...valid, variantSlugs: [] }],
    ["bad zip format", { ...valid, zip: "abc" }],
    ["unknown zip", { ...valid, zip: "0001", radiusKm: 50 }],
    ["radius too large", { ...valid, zip: "1010", radiusKm: 999 }],
  ])("rejects %s", (_label, input) => {
    expect(validatePushInput(input as never)).toBeNull();
  });
});

describe("upsertPushSubscription", () => {
  it("upserts by endpoint", async () => {
    const db = await createDb(":memory:");
    const input = validatePushInput({
      endpoint: "https://push.example/x",
      keys: { p256dh: "k", auth: "a" },
      variantSlugs: ["portasplit"],
    })!;
    await upsertPushSubscription(db, input, 1000);
    await upsertPushSubscription(db, { ...input, variantSlugs: ["portasplit", "portasplit-cool"] }, 2000);
    const rows = await db.getRepository(PushSubscriptionEntity).find();
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].variantSlugs)).toHaveLength(2);
  });
});
