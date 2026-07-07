import { EntitySchema } from "typeorm";

export type StockStatusDb = "in_stock" | "out_of_stock" | "unknown";

export interface Variant {
  slug: string;
  name: string;
  uvpCents: number;
}
export const VariantEntity = new EntitySchema<Variant>({
  name: "variant",
  tableName: "variants",
  columns: {
    slug: { type: "text", primary: true },
    name: { type: "text" },
    uvpCents: { type: "integer", name: "uvp_cents" },
  },
});

export interface Retailer {
  slug: string;
  name: string;
  homepage: string;
}
export const RetailerEntity = new EntitySchema<Retailer>({
  name: "retailer",
  tableName: "retailers",
  columns: {
    slug: { type: "text", primary: true },
    name: { type: "text" },
    homepage: { type: "text" },
  },
});

export interface Offer {
  id: number;
  retailerSlug: string;
  variantSlug: string;
  url: string;
  priceCents: number | null;
  status: StockStatusDb;
  pickupNote: string | null;
  lastCheckedAt: number;
  lastChangedAt: number;
}
export const OfferEntity = new EntitySchema<Offer>({
  name: "offer",
  tableName: "offers",
  columns: {
    id: { type: "integer", primary: true, generated: true },
    retailerSlug: { type: "text", name: "retailer_slug" },
    variantSlug: { type: "text", name: "variant_slug" },
    url: { type: "text" },
    priceCents: { type: "integer", name: "price_cents", nullable: true },
    status: { type: "text", default: "unknown" },
    pickupNote: { type: "text", name: "pickup_note", nullable: true },
    lastCheckedAt: { type: "integer", name: "last_checked_at", default: 0 },
    lastChangedAt: { type: "integer", name: "last_changed_at", default: 0 },
  },
  indices: [
    {
      name: "offers_retailer_variant",
      columns: ["retailerSlug", "variantSlug"],
      unique: true,
    },
  ],
});

export interface Store {
  id: number;
  retailerSlug: string;
  externalId: string;
  name: string;
  zip: string;
  city: string;
  /** degrees * 1e6 */
  latE6: number;
  lngE6: number;
}
export const StoreEntity = new EntitySchema<Store>({
  name: "store",
  tableName: "stores",
  columns: {
    id: { type: "integer", primary: true, generated: true },
    retailerSlug: { type: "text", name: "retailer_slug" },
    externalId: { type: "text", name: "external_id" },
    name: { type: "text" },
    zip: { type: "text" },
    city: { type: "text" },
    latE6: { type: "integer", name: "lat_e6" },
    lngE6: { type: "integer", name: "lng_e6" },
  },
  indices: [
    {
      name: "stores_retailer_external",
      columns: ["retailerSlug", "externalId"],
      unique: true,
    },
  ],
});

export interface StoreAvailability {
  id: number;
  storeId: number;
  variantSlug: string;
  inStock: boolean;
  lastCheckedAt: number;
  lastChangedAt: number;
}
export const StoreAvailabilityEntity = new EntitySchema<StoreAvailability>({
  name: "store_availability",
  tableName: "store_availability",
  columns: {
    id: { type: "integer", primary: true, generated: true },
    storeId: { type: "integer", name: "store_id" },
    variantSlug: { type: "text", name: "variant_slug" },
    inStock: { type: "boolean", name: "in_stock" },
    lastCheckedAt: { type: "integer", name: "last_checked_at", default: 0 },
    lastChangedAt: { type: "integer", name: "last_changed_at", default: 0 },
  },
  indices: [{ name: "sa_store_variant", columns: ["storeId", "variantSlug"], unique: true }],
});

export type EventTypeDb = "online_restock" | "online_soldout" | "price_change" | "store_restock" | "store_soldout";

export interface EventRow {
  id: number;
  type: EventTypeDb;
  retailerSlug: string;
  variantSlug: string;
  storeId: number | null;
  priceCents: number | null;
  createdAt: number;
}
export const EventEntity = new EntitySchema<EventRow>({
  name: "event",
  tableName: "events",
  columns: {
    id: { type: "integer", primary: true, generated: true },
    type: { type: "text" },
    retailerSlug: { type: "text", name: "retailer_slug" },
    variantSlug: { type: "text", name: "variant_slug" },
    storeId: { type: "integer", name: "store_id", nullable: true },
    priceCents: { type: "integer", name: "price_cents", nullable: true },
    createdAt: { type: "integer", name: "created_at" },
  },
  indices: [{ name: "events_created", columns: ["createdAt"] }],
});

export interface PushSubscription {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  /** JSON array string of variant slugs */
  variantSlugs: string;
  zip: string | null;
  radiusKm: number | null;
  createdAt: number;
}
export const PushSubscriptionEntity = new EntitySchema<PushSubscription>({
  name: "push_subscription",
  tableName: "push_subscriptions",
  columns: {
    id: { type: "integer", primary: true, generated: true },
    endpoint: { type: "text", unique: true },
    p256dh: { type: "text" },
    auth: { type: "text" },
    variantSlugs: { type: "text", name: "variant_slugs" },
    zip: { type: "text", nullable: true },
    radiusKm: { type: "integer", name: "radius_km", nullable: true },
    createdAt: { type: "integer", name: "created_at" },
  },
});

export interface EmailSubscription {
  id: number;
  email: string;
  confirmToken: string;
  unsubscribeToken: string;
  confirmed: boolean;
  variantSlugs: string;
  zip: string | null;
  radiusKm: number | null;
  createdAt: number;
  /** When the last confirmation mail was sent — throttles re-sends. */
  confirmSentAt: number;
}
export const EmailSubscriptionEntity = new EntitySchema<EmailSubscription>({
  name: "email_subscription",
  tableName: "email_subscriptions",
  columns: {
    id: { type: "integer", primary: true, generated: true },
    email: { type: "text", unique: true },
    confirmToken: { type: "text", name: "confirm_token" },
    unsubscribeToken: { type: "text", name: "unsubscribe_token" },
    confirmed: { type: "boolean", default: false },
    variantSlugs: { type: "text", name: "variant_slugs" },
    zip: { type: "text", nullable: true },
    radiusKm: { type: "integer", name: "radius_km", nullable: true },
    createdAt: { type: "integer", name: "created_at" },
    confirmSentAt: { type: "integer", name: "confirm_sent_at", default: 0 },
  },
});

export interface CheckRun {
  id: number;
  startedAt: number;
  durationMs: number;
  /** JSON: per-adapter outcome */
  summary: string;
}
export const CheckRunEntity = new EntitySchema<CheckRun>({
  name: "check_run",
  tableName: "check_runs",
  columns: {
    id: { type: "integer", primary: true, generated: true },
    startedAt: { type: "integer", name: "started_at" },
    durationMs: { type: "integer", name: "duration_ms" },
    summary: { type: "text" },
  },
});

export interface NotificationLogRow {
  id: number;
  channel: "push" | "email";
  subscriptionId: number;
  /** 'online:{retailer}:{variant}' | 'store:{retailer}:{externalId}:{variant}' */
  dedupeKey: string;
  sentAt: number;
}
export const NotificationLogEntity = new EntitySchema<NotificationLogRow>({
  name: "notification_log",
  tableName: "notification_log",
  columns: {
    id: { type: "integer", primary: true, generated: true },
    channel: { type: "text" },
    subscriptionId: { type: "integer", name: "subscription_id" },
    dedupeKey: { type: "text", name: "dedupe_key" },
    sentAt: { type: "integer", name: "sent_at" },
  },
  indices: [
    // Serves the batched cooldown lookup (channel + dedupeKey equality, sentAt range;
    // subscriptionId is filtered with IN over the equality prefix).
    { name: "nl_dedupe", columns: ["channel", "dedupeKey", "sentAt"] },
    // Serves pruneOldData's `DELETE WHERE sent_at < cutoff`, which the composite
    // index above (led by channel) can't use.
    { name: "nl_sent_at", columns: ["sentAt"] },
  ],
});

export const allEntities = [
  VariantEntity,
  RetailerEntity,
  OfferEntity,
  StoreEntity,
  StoreAvailabilityEntity,
  EventEntity,
  PushSubscriptionEntity,
  EmailSubscriptionEntity,
  CheckRunEntity,
  NotificationLogEntity,
];
