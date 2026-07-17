import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, EmailSubscriptionEntity, type AppDb } from "@/db";
import { confirmEmail, createEmailSubscription, sendAlertEmail, unsubscribeEmail } from "@/lib/notify/email";

describe("email subscriptions", () => {
  let db: AppDb;
  const send = vi.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    db = await createDb(":memory:");
    send.mockClear();
  });

  it("creates an unconfirmed subscription and sends a confirm mail", async () => {
    const result = await createEmailSubscription(db, { email: "julian@example.at", variantSlugs: ["portasplit"] }, send);
    expect(result).toBe("created");
    const row = await db.getRepository(EmailSubscriptionEntity).findOneByOrFail({
      email: "julian@example.at",
    });
    expect(row.confirmed).toBe(false);
    expect(send).toHaveBeenCalledOnce();
    const [to, subject, html] = send.mock.calls[0];
    expect(to).toBe("julian@example.at");
    expect(subject).toContain("bestätigen");
    expect(html).toContain(`/api/subscribe/email/confirm?token=${row.confirmToken}`);
  });

  it("throttles rapid re-signups, then resends after the window", async () => {
    await createEmailSubscription(db, { email: "a@b.at", variantSlugs: ["portasplit"] }, send, 1000);
    const first = await db.getRepository(EmailSubscriptionEntity).findOneByOrFail({ email: "a@b.at" });

    // Within the 2-min window: prefs update, but NO second mail (anti-bombing).
    const r2 = await createEmailSubscription(db, { email: "a@b.at", variantSlugs: ["portasplit", "portasplit-cool"] }, send, 1000 + 60_000);
    expect(r2).toBe("resent");
    expect(send).toHaveBeenCalledTimes(1);
    const second = await db.getRepository(EmailSubscriptionEntity).findOneByOrFail({ email: "a@b.at" });
    expect(second.confirmToken).toBe(first.confirmToken);
    expect(JSON.parse(second.variantSlugs)).toHaveLength(2); // prefs still updated

    // After the window: fresh token + a real resend.
    await createEmailSubscription(db, { email: "a@b.at", variantSlugs: ["portasplit"] }, send, 1000 + 3 * 60_000);
    expect(send).toHaveBeenCalledTimes(2);
    const third = await db.getRepository(EmailSubscriptionEntity).findOneByOrFail({ email: "a@b.at" });
    expect(third.confirmToken).not.toBe(first.confirmToken);
    expect(await db.getRepository(EmailSubscriptionEntity).count()).toBe(1);
  });

  it("updates prefs for an already-confirmed address and returns 'updated' without sending", async () => {
    // A confirmed subscriber editing prefs must NOT get a mail (anti-abuse) and the
    // outcome must be distinguishable from a signup so the UI can say "prefs updated"
    // instead of the misleading "check your email to confirm".
    await createEmailSubscription(db, { email: "a@b.at", variantSlugs: ["portasplit"] }, send, 1000);
    const row = await db.getRepository(EmailSubscriptionEntity).findOneByOrFail({ email: "a@b.at" });
    await confirmEmail(db, row.confirmToken);
    send.mockClear();

    const result = await createEmailSubscription(db, { email: "a@b.at", variantSlugs: ["portasplit", "portasplit-cool"] }, send, 9_999_999_999);
    expect(result).toBe("updated");
    expect(send).not.toHaveBeenCalled();
    const after = await db.getRepository(EmailSubscriptionEntity).findOneByOrFail({ email: "a@b.at" });
    expect(after.confirmed).toBe(true);
    expect(JSON.parse(after.variantSlugs)).toHaveLength(2);
  });

  it("rejects invalid emails and variants without sending", async () => {
    expect(await createEmailSubscription(db, { email: "nope", variantSlugs: ["portasplit"] }, send)).toBe("invalid");
    expect(await createEmailSubscription(db, { email: "a@b.at", variantSlugs: [] }, send)).toBe("invalid");
    expect(await createEmailSubscription(db, { email: "a@b.at", variantSlugs: ["x"] }, send)).toBe("invalid");
    expect(send).not.toHaveBeenCalled();
  });

  it("confirms with the right token only", async () => {
    await createEmailSubscription(db, { email: "a@b.at", variantSlugs: ["portasplit"] }, send);
    const row = await db.getRepository(EmailSubscriptionEntity).findOneByOrFail({ email: "a@b.at" });
    expect(await confirmEmail(db, "wrong")).toBe(false);
    expect(await confirmEmail(db, row.confirmToken)).toBe(true);
    const after = await db.getRepository(EmailSubscriptionEntity).findOneByOrFail({ email: "a@b.at" });
    expect(after.confirmed).toBe(true);
  });

  it("unsubscribes by deleting the row", async () => {
    await createEmailSubscription(db, { email: "a@b.at", variantSlugs: ["portasplit"] }, send);
    const row = await db.getRepository(EmailSubscriptionEntity).findOneByOrFail({ email: "a@b.at" });
    expect(await unsubscribeEmail(db, "wrong")).toBe(false);
    expect(await unsubscribeEmail(db, row.unsubscribeToken)).toBe(true);
    expect(await db.getRepository(EmailSubscriptionEntity).count()).toBe(0);
  });

  it("sendAlertEmail includes the unsubscribe link", async () => {
    await createEmailSubscription(db, { email: "a@b.at", variantSlugs: ["portasplit"] }, send);
    const row = await db.getRepository(EmailSubscriptionEntity).findOneByOrFail({ email: "a@b.at" });
    send.mockClear();
    const result = await sendAlertEmail(db, row.id, "Porta da!", "<p>Jetzt!</p>", send);
    expect(result).toBe("sent");
    const [, , html] = send.mock.calls[0];
    expect(html).toContain(`unsubscribe?token=${row.unsubscribeToken}`);
  });

  it("sendAlertEmail returns failed when the provider errors", async () => {
    await createEmailSubscription(db, { email: "a@b.at", variantSlugs: ["portasplit"] }, send);
    const row = await db.getRepository(EmailSubscriptionEntity).findOneByOrFail({ email: "a@b.at" });
    const failing = vi.fn().mockRejectedValue(new Error("cap"));
    expect(await sendAlertEmail(db, row.id, "s", "<p>x</p>", failing)).toBe("failed");
  });
});
