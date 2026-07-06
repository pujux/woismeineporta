import webpush from "web-push";
import { PushSubscriptionEntity, type AppDb } from "@/db";
import { plzToLatLng } from "@/lib/geo";
import { VARIANT_SLUGS } from "@/lib/variants";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

export interface PushSender {
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ): Promise<unknown>;
}

let configured = false;
function defaultSender(): PushSender {
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
      process.env.VAPID_PUBLIC_KEY ?? "",
      process.env.VAPID_PRIVATE_KEY ?? "",
    );
    configured = true;
  }
  return webpush;
}

export async function sendPush(
  db: AppDb,
  subscriptionId: number,
  payload: PushPayload,
  sender?: PushSender,
): Promise<"sent" | "gone" | "failed"> {
  const repo = db.getRepository(PushSubscriptionEntity);
  const sub = await repo.findOneBy({ id: subscriptionId });
  if (!sub) return "gone";
  try {
    await (sender ?? defaultSender()).sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) {
      await repo.delete(sub.id);
      return "gone";
    }
    console.error(`push send failed for #${subscriptionId}:`, err);
    return "failed";
  }
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  variantSlugs: string[];
  zip?: string;
  radiusKm?: number;
}

export function validatePushInput(input: unknown): PushSubscriptionInput | null {
  const o = input as Partial<PushSubscriptionInput> | null;
  if (!o || typeof o.endpoint !== "string" || !o.endpoint.startsWith("https://")) return null;
  if (typeof o.keys?.p256dh !== "string" || typeof o.keys?.auth !== "string") return null;
  if (
    !Array.isArray(o.variantSlugs) ||
    o.variantSlugs.length === 0 ||
    !o.variantSlugs.every((v) => (VARIANT_SLUGS as readonly string[]).includes(v))
  ) {
    return null;
  }
  let zip: string | undefined;
  let radiusKm: number | undefined;
  if (o.zip !== undefined && o.zip !== null && o.zip !== "") {
    if (typeof o.zip !== "string" || !/^\d{4}$/.test(o.zip) || !plzToLatLng(o.zip)) return null;
    zip = o.zip;
    radiusKm = typeof o.radiusKm === "number" ? o.radiusKm : 50;
    if (radiusKm < 1 || radiusKm > 200) return null;
  }
  return {
    endpoint: o.endpoint,
    keys: { p256dh: o.keys.p256dh, auth: o.keys.auth },
    variantSlugs: [...new Set(o.variantSlugs)],
    zip,
    radiusKm,
  };
}

export async function upsertPushSubscription(
  db: AppDb,
  input: PushSubscriptionInput,
  now: number,
): Promise<void> {
  await db.getRepository(PushSubscriptionEntity).upsert(
    {
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      variantSlugs: JSON.stringify(input.variantSlugs),
      zip: input.zip ?? null,
      radiusKm: input.radiusKm ?? null,
      createdAt: now,
    },
    ["endpoint"],
  );
}

export async function deletePushSubscription(db: AppDb, endpoint: string): Promise<void> {
  await db.getRepository(PushSubscriptionEntity).delete({ endpoint });
}
