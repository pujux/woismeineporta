import { In, MoreThan } from "typeorm";
import { EmailSubscriptionEntity, NotificationLogEntity, OfferEntity, PushSubscriptionEntity, RetailerEntity, StoreEntity, type AppDb } from "@/db";
import type { StockEvent } from "@/lib/diff";
import { formatPrice } from "@/lib/format";
import { distanceKm, plzToLatLng } from "@/lib/geo";
import { VARIANT_NAMES } from "@/lib/variants";
import { sendAlertEmail } from "./email";
import { sendPush, type PushPayload } from "./push";

const COOLDOWN_MS = 60 * 60_000;
// A restock fans out to every matching subscriber; sending serially would make
// the last person wait for all the sends before them. Fire them in bounded
// parallel so latency is roughly one send, not N.
const SEND_CONCURRENCY = 20;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** One query per (channel, dedupeKey): which of these subscribers are still cooling down. */
async function subsUnderCooldown(db: AppDb, channel: "push" | "email", dedupeKey: string, subIds: number[], now: number): Promise<Set<number>> {
  if (subIds.length === 0) return new Set();
  const rows = await db.getRepository(NotificationLogEntity).findBy({
    channel,
    dedupeKey,
    subscriptionId: In(subIds),
    sentAt: MoreThan(now - COOLDOWN_MS),
  });
  return new Set(rows.map((r) => r.subscriptionId));
}

interface Deps {
  push?: typeof sendPush;
  email?: typeof sendAlertEmail;
}

interface Message extends PushPayload {
  dedupeKey: string;
  variantSlug: string;
  storeGeo: { lat: number; lng: number } | null; // set for store events
}

async function buildMessage(db: AppDb, event: StockEvent): Promise<Message | null> {
  const retailer = await db.getRepository(RetailerEntity).findOneBy({ slug: event.retailerSlug });
  const retailerName = retailer?.name ?? event.retailerSlug;
  const variantName = VARIANT_NAMES[event.variantSlug] ?? event.variantSlug;
  const offer = await db.getRepository(OfferEntity).findOneBy({
    retailerSlug: event.retailerSlug,
    variantSlug: event.variantSlug,
  });
  const url = offer?.url ?? retailer?.homepage ?? "https://www.google.at";
  const title = `🟢 ${variantName} bestellbar!`;

  if (event.type === "online_restock") {
    const price = event.priceCents != null ? ` um ${formatPrice(event.priceCents)}` : "";
    return {
      title,
      body: `Jetzt bei ${retailerName}${price} bestellbar`,
      url,
      dedupeKey: `online:${event.retailerSlug}:${event.variantSlug}`,
      variantSlug: event.variantSlug,
      storeGeo: null,
    };
  }

  if (event.type === "store_restock" && event.storeExternalId) {
    const store = await db.getRepository(StoreEntity).findOneBy({
      retailerSlug: event.retailerSlug,
      externalId: event.storeExternalId,
    });
    if (!store) return null;
    return {
      title,
      body: `Bei ${retailerName} ${store.name} (${store.zip} ${store.city}) verfügbar`,
      url,
      dedupeKey: `store:${event.retailerSlug}:${event.storeExternalId}:${event.variantSlug}`,
      variantSlug: event.variantSlug,
      storeGeo: { lat: store.latE6 / 1e6, lng: store.lngE6 / 1e6 },
    };
  }

  return null;
}

function matches(message: Message, sub: { variantSlugs: string; zip: string | null; radiusKm: number | null }): boolean {
  const variants: string[] = JSON.parse(sub.variantSlugs);
  if (!variants.includes(message.variantSlug)) return false;
  if (!message.storeGeo) return true; // online events go to everyone
  if (!sub.zip || !sub.radiusKm) return false; // store events need a location filter
  const home = plzToLatLng(sub.zip);
  if (!home) return false;
  return distanceKm(home.lat, home.lng, message.storeGeo.lat, message.storeGeo.lng) <= sub.radiusKm;
}

export async function notifyEvents(db: AppDb, events: StockEvent[], now: number, deps: Deps = {}): Promise<{ pushed: number; emailed: number }> {
  const doPush = deps.push ?? sendPush;
  const doEmail = deps.email ?? sendAlertEmail;
  const log = db.getRepository(NotificationLogEntity);
  let pushed = 0;
  let emailed = 0;

  for (const event of events) {
    if (event.type !== "online_restock" && event.type !== "store_restock") continue;
    const message = await buildMessage(db, event);
    if (!message) continue;

    // Push: pick matching subs, drop those cooling down (one query), send in parallel.
    const pushSubs = (await db.getRepository(PushSubscriptionEntity).find()).filter((s) => matches(message, s));
    const pushCooled = await subsUnderCooldown(db, "push", message.dedupeKey, pushSubs.map((s) => s.id), now);
    const pushSent = (
      await mapLimit(
        pushSubs.filter((s) => !pushCooled.has(s.id)),
        SEND_CONCURRENCY,
        async (sub) => ({ id: sub.id, ok: (await doPush(db, sub.id, { title: message.title, body: message.body, url: message.url })) === "sent" }),
      )
    ).filter((r) => r.ok);
    pushed += pushSent.length;

    // Email: confirmed subscribers only, same batched-cooldown + parallel-send shape.
    const emailSubs = (await db.getRepository(EmailSubscriptionEntity).findBy({ confirmed: true })).filter((s) => matches(message, s));
    const emailCooled = await subsUnderCooldown(db, "email", message.dedupeKey, emailSubs.map((s) => s.id), now);
    const html = `<p>${message.body}.</p><p><a href="${message.url}">Direkt zum Angebot</a></p>`;
    const emailSent = (
      await mapLimit(
        emailSubs.filter((s) => !emailCooled.has(s.id)),
        SEND_CONCURRENCY,
        async (sub) => ({ id: sub.id, ok: (await doEmail(db, sub.id, message.title, html)) === "sent" }),
      )
    ).filter((r) => r.ok);
    emailed += emailSent.length;

    // One bulk insert per channel instead of one per subscriber.
    const rows = [
      ...pushSent.map((r) => ({ channel: "push" as const, subscriptionId: r.id, dedupeKey: message.dedupeKey, sentAt: now })),
      ...emailSent.map((r) => ({ channel: "email" as const, subscriptionId: r.id, dedupeKey: message.dedupeKey, sentAt: now })),
    ];
    if (rows.length) await log.insert(rows);
  }

  return { pushed, emailed };
}
