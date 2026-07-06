import crypto from "node:crypto";
import { Resend } from "resend";
import { EmailSubscriptionEntity, type AppDb } from "@/db";
import { plzToLatLng } from "@/lib/geo";
import { VARIANT_SLUGS } from "@/lib/variants";

export type SendFn = (to: string, subject: string, html: string) => Promise<void>;

let resend: Resend | undefined;
const defaultSend: SendFn = async (to, subject, html) => {
  resend ??= new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Wo ist meine Porta? <onboarding@resend.dev>",
    to,
    subject,
    html,
  });
  if (error) throw new Error(`resend: ${error.message}`);
};

function baseUrl(): string {
  return process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function createEmailSubscription(
  db: AppDb,
  input: { email: string; variantSlugs: string[]; zip?: string; radiusKm?: number },
  send: SendFn = defaultSend,
): Promise<"created" | "resent" | "invalid"> {
  const email = input.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return "invalid";
  if (
    !Array.isArray(input.variantSlugs) ||
    input.variantSlugs.length === 0 ||
    !input.variantSlugs.every((v) => (VARIANT_SLUGS as readonly string[]).includes(v))
  ) {
    return "invalid";
  }
  let zip: string | null = null;
  let radiusKm: number | null = null;
  if (input.zip) {
    if (!/^\d{4}$/.test(input.zip) || !plzToLatLng(input.zip)) return "invalid";
    zip = input.zip;
    radiusKm = input.radiusKm && input.radiusKm >= 1 && input.radiusKm <= 200 ? input.radiusKm : 50;
  }

  const repo = db.getRepository(EmailSubscriptionEntity);
  const existing = await repo.findOneBy({ email });
  const confirmToken = crypto.randomUUID();
  const unsubscribeToken = existing?.unsubscribeToken ?? crypto.randomUUID();

  if (existing) {
    await repo.update(existing.id, {
      confirmToken,
      variantSlugs: JSON.stringify([...new Set(input.variantSlugs)]),
      zip,
      radiusKm,
    });
  } else {
    await repo.insert({
      email,
      confirmToken,
      unsubscribeToken,
      confirmed: false,
      variantSlugs: JSON.stringify([...new Set(input.variantSlugs)]),
      zip,
      radiusKm,
      createdAt: Date.now(),
    });
  }

  const confirmUrl = `${baseUrl()}/api/subscribe/email/confirm?token=${confirmToken}`;
  await send(
    email,
    "Bitte bestätigen: PortaSplit-Alarm",
    `<p>Servus!</p>
     <p>Klick auf den Link, um deinen PortaSplit-Verfügbarkeits-Alarm zu aktivieren:</p>
     <p><a href="${confirmUrl}">Alarm aktivieren</a></p>
     <p>Falls du das nicht warst, ignorier diese E-Mail einfach.</p>`,
  );
  return existing ? "resent" : "created";
}

export async function confirmEmail(db: AppDb, token: string): Promise<boolean> {
  if (!token) return false;
  const repo = db.getRepository(EmailSubscriptionEntity);
  const row = await repo.findOneBy({ confirmToken: token });
  if (!row) return false;
  await repo.update(row.id, { confirmed: true });
  return true;
}

export async function unsubscribeEmail(db: AppDb, token: string): Promise<boolean> {
  if (!token) return false;
  const repo = db.getRepository(EmailSubscriptionEntity);
  const result = await repo.delete({ unsubscribeToken: token });
  return (result.affected ?? 0) > 0;
}

export async function sendAlertEmail(
  db: AppDb,
  subscriptionId: number,
  subject: string,
  html: string,
  send: SendFn = defaultSend,
): Promise<"sent" | "failed"> {
  const row = await db.getRepository(EmailSubscriptionEntity).findOneBy({ id: subscriptionId });
  if (!row) return "failed";
  const unsubscribeUrl = `${baseUrl()}/api/subscribe/email/unsubscribe?token=${row.unsubscribeToken}`;
  try {
    await send(
      row.email,
      subject,
      `${html}<p style="color:#888;font-size:12px"><a href="${unsubscribeUrl}">Alarm abbestellen</a></p>`,
    );
    return "sent";
  } catch (err) {
    console.error(`alert mail failed for #${subscriptionId}:`, err);
    return "failed";
  }
}
