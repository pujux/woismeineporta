import { EmailSubscriptionEntity, NotificationLogEntity, OfferEntity, PushSubscriptionEntity, RetailerEntity, StoreEntity, type AppDb } from "@/db";
import type { StockEvent } from "@/lib/diff";
import { formatPrice } from "@/lib/format";
import { distanceKm, plzToLatLng } from "@/lib/geo";
import { VARIANT_NAMES } from "@/lib/variants";
import { sendAlertEmail } from "./email";
import { sendPush, type PushPayload } from "./push";

const COOLDOWN_MS = 60 * 60_000;

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

async function underCooldown(db: AppDb, channel: "push" | "email", subscriptionId: number, dedupeKey: string, now: number): Promise<boolean> {
  const recent = await db
    .getRepository(NotificationLogEntity)
    .createQueryBuilder("nl")
    .where("nl.channel = :channel AND nl.subscription_id = :subscriptionId", { channel, subscriptionId })
    .andWhere("nl.dedupe_key = :dedupeKey AND nl.sent_at > :cutoff", {
      dedupeKey,
      cutoff: now - COOLDOWN_MS,
    })
    .getOne();
  return recent !== null;
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

    for (const sub of await db.getRepository(PushSubscriptionEntity).find()) {
      if (!matches(message, sub)) continue;
      if (await underCooldown(db, "push", sub.id, message.dedupeKey, now)) continue;
      const result = await doPush(db, sub.id, {
        title: message.title,
        body: message.body,
        url: message.url,
      });
      if (result === "sent") {
        pushed++;
        await log.insert({ channel: "push", subscriptionId: sub.id, dedupeKey: message.dedupeKey, sentAt: now });
      }
    }

    for (const sub of await db.getRepository(EmailSubscriptionEntity).findBy({ confirmed: true })) {
      if (!matches(message, sub)) continue;
      if (await underCooldown(db, "email", sub.id, message.dedupeKey, now)) continue;
      const html = `<p>${message.body}.</p><p><a href="${message.url}">Direkt zum Angebot</a></p>`;
      const result = await doEmail(db, sub.id, message.title, html);
      if (result === "sent") {
        emailed++;
        await log.insert({ channel: "email", subscriptionId: sub.id, dedupeKey: message.dedupeKey, sentAt: now });
      }
    }
  }

  return { pushed, emailed };
}
