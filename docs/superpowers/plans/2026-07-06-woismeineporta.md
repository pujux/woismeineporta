# woismeineporta.at Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Availability tracker + instant-alert service for Midea PortaSplit / PortaSplit Cool across Austrian retailers, running as one Docker container on Dokploy.

**Architecture:** Next.js 16 App Router monolith. SQLite (TypeORM + better-sqlite3 driver, EntitySchema definitions — no decorators) on a Docker volume. In-process poller started from `instrumentation.ts` runs retailer adapters on a 30s/180s tier schedule, diffs against DB state, and fans out Web Push + Resend email on restock events. Server-rendered German UI with client-side 30s refresh.

**Tech Stack:** Node 22, pnpm, Next.js 16 (App Router, standalone output), TypeScript strict, Tailwind CSS v4, typeorm + better-sqlite3, web-push, resend, vitest.

**Spec:** `docs/superpowers/specs/2026-07-06-woismeineporta-design.md`

## Global Constraints

- Package manager: **pnpm**. Node 22.
- All UI copy in **German**. Site name: **"Wo is meine Porta?"**
- Variant slugs are exactly `portasplit` and `portasplit-cool`; retailer slugs exactly `bauhaus`, `obi`, `hornbach`, `mediamarkt`, `tepto`.
- Prices stored as **integer cents**; timestamps as **unix ms integers**.
- SQLite file path from env `DATABASE_PATH` (default `./data/app.db`); tests use in-memory DB (`:memory:`). TypeORM uses `synchronize: true` (small additive schema, documented in README with backup note) — no migration files. All DB-touching functions are `async`.
- Poller only starts when `ENABLE_POLLER=1`. Intervals: `POLL_FAST_MS` (default 30000), `POLL_SLOW_MS` (default 180000).
- A failing adapter must never crash a tick; it yields status `unknown`.
- Test runner: `pnpm vitest run` (config in `vitest.config.ts`). Every task commits when green.
- Env vars (document all in `.env.example`): `DATABASE_PATH`, `ENABLE_POLLER`, `POLL_FAST_MS`, `POLL_SLOW_MS`, `ADMIN_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `RESEND_API_KEY`, `EMAIL_FROM`, `PUBLIC_BASE_URL`.

---

### Task 1: Project scaffold

**Files:**

- Create: Next.js app in repo root via create-next-app, `vitest.config.ts`, `.env.example`, `data/.gitkeep`
- Modify: `package.json` (scripts), `.gitignore` (add `data/*.db*`, `.env`)

**Interfaces:**

- Produces: working `pnpm dev`, `pnpm build`, `pnpm vitest run` (0 tests OK → use `--passWithNoTests`), Tailwind v4 wired.

- [ ] **Step 1: Scaffold** (repo already has `docs/` + `.git` — create-next-app tolerates non-empty dir only when files don't conflict; scaffold into a temp dir and move if it refuses)

```bash
pnpm create next-app@latest . --ts --tailwind --app --no-src-dir=false --src-dir --eslint --no-import-alias --use-pnpm --turbopack
```

Answer prompts: TypeScript yes, Tailwind yes, App Router yes, src dir yes, alias `@/*` default.

- [ ] **Step 2: Add deps**

```bash
pnpm add typeorm reflect-metadata better-sqlite3 web-push resend
pnpm add -D vitest @types/better-sqlite3 @types/web-push tsx
```

- [ ] **Step 3: Configure**

`next.config.ts`: set `output: 'standalone'` and `serverExternalPackages: ['better-sqlite3']`.

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", passWithNoTests: true },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

`package.json` scripts: add `"test": "vitest run"`.

`.env.example` with every var from Global Constraints, with comments.

`.gitignore`: append `data/*.db*` and `.env`.

- [ ] **Step 4: Verify**

Run: `pnpm build && pnpm test` — both succeed.

- [ ] **Step 5: Commit** `chore: scaffold next.js app with tailwind, typeorm, vitest`

---

### Task 2: Database entities, DataSource, seed (TypeORM)

**Files:**

- Create: `src/db/entities.ts`, `src/db/index.ts`, `src/db/seed.ts`
- Test: `src/db/__tests__/db.test.ts`

**Interfaces:**

- Produces:
  - `createDb(path?: string): Promise<AppDb>` in `src/db/index.ts` — initializes a TypeORM DataSource (`type: 'better-sqlite3'`, `synchronize: true`, WAL pragma for file DBs), seeds `variants` + `retailers`. `export type AppDb = DataSource`.
  - `getDb(): Promise<AppDb>` — lazy singleton promise using `process.env.DATABASE_PATH ?? './data/app.db'`.
  - Row interfaces + EntitySchema exports (exact names): `Variant`/`VariantEntity`, `Retailer`/`RetailerEntity`, `Offer`/`OfferEntity`, `Store`/`StoreEntity`, `StoreAvailability`/`StoreAvailabilityEntity`, `EventRow`/`EventEntity`, `PushSubscription`/`PushSubscriptionEntity`, `EmailSubscription`/`EmailSubscriptionEntity`, `CheckRun`/`CheckRunEntity`, `NotificationLogRow`/`NotificationLogEntity`.

- [ ] **Step 1: Write entities** — `src/db/entities.ts` (EntitySchema, no decorators — keeps Turbopack/Vitest config untouched):

```ts
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
    lastCheckedAt: { type: "integer", name: "last_checked_at", default: 0 },
    lastChangedAt: { type: "integer", name: "last_changed_at", default: 0 },
  },
  indices: [{ name: "offers_retailer_variant", columns: ["retailerSlug", "variantSlug"], unique: true }],
});

export interface Store {
  id: number;
  retailerSlug: string;
  externalId: string;
  name: string;
  zip: string;
  city: string;
  latE6: number;
  lngE6: number; // degrees * 1e6
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
  indices: [{ name: "stores_retailer_external", columns: ["retailerSlug", "externalId"], unique: true }],
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
  variantSlugs: string; // JSON array string
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
  },
});

export interface CheckRun {
  id: number;
  startedAt: number;
  durationMs: number;
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
  dedupeKey: string;
  sentAt: number; // dedupeKey: 'online:{retailer}:{variant}' | 'store:{retailer}:{externalId}:{variant}'
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
  indices: [{ name: "nl_dedupe", columns: ["channel", "subscriptionId", "dedupeKey", "sentAt"] }],
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
```

- [ ] **Step 2: DataSource + seed** — `src/db/index.ts`:

```ts
import "reflect-metadata";
import { DataSource } from "typeorm";
import { allEntities } from "./entities";
import { seed } from "./seed";
import path from "node:path";
import fs from "node:fs";

export type AppDb = DataSource;
export * from "./entities";

export async function createDb(dbPath = process.env.DATABASE_PATH ?? "./data/app.db"): Promise<AppDb> {
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const ds = new DataSource({
    type: "better-sqlite3",
    database: dbPath,
    entities: allEntities,
    synchronize: true,
  });
  await ds.initialize();
  if (dbPath !== ":memory:") await ds.query("PRAGMA journal_mode = WAL");
  await seed(ds);
  return ds;
}

let singleton: Promise<AppDb> | undefined;
export function getDb(): Promise<AppDb> {
  if (!singleton) singleton = createDb();
  return singleton;
}
```

`src/db/seed.ts`: `export async function seed(db: AppDb)` — `repo.upsert(rows, ['slug'])` for the 2 variants (`portasplit` "Midea PortaSplit" 119900; `portasplit-cool` "Midea PortaSplit Cool" 89900) and 5 retailers (bauhaus/BAUHAUS/https://www.bauhaus.at, obi/OBI/https://www.obi.at, hornbach/HORNBACH/https://www.hornbach.at, mediamarkt/MediaMarkt/https://www.mediamarkt.at, tepto/Tepto/https://www.tepto.at).

- [ ] **Step 3: Write failing test** — `src/db/__tests__/db.test.ts`: `await createDb(':memory:')` → variants repo count 2, retailers 5; `seed` twice → still 2/5; insert+read an Offer row roundtrips.

- [ ] **Step 4: Run** `pnpm test` → PASS. Fix until green.

- [ ] **Step 5: Commit** `feat: typeorm entities, datasource, seed`

---

### Task 3: Adapter contract + registry

**Files:**

- Create: `src/lib/retailers/types.ts`, `src/lib/retailers/registry.ts`, `src/lib/retailers/fetch.ts`
- Test: `src/lib/retailers/__tests__/fetch.test.ts`

**Interfaces:**

- Produces (exact, all tasks 5–7 and 11 depend on these):

```ts
// src/lib/retailers/types.ts
export type StockStatus = "in_stock" | "out_of_stock" | "unknown";
export type VariantSlug = "portasplit" | "portasplit-cool";

export interface OnlineOffer {
  variant: VariantSlug;
  url: string;
  priceCents: number | null;
  status: StockStatus;
}

export interface StoreInfo {
  externalId: string;
  name: string;
  zip: string;
  city: string;
  lat: number; // decimal degrees
  lng: number;
}

export interface StoreStock {
  store: StoreInfo;
  variant: VariantSlug;
  inStock: boolean;
}

export interface RetailerResult {
  retailerSlug: string;
  offers: OnlineOffer[];
  storeStock: StoreStock[] | null; // null = store-level unsupported
}

export interface RetailerAdapter {
  slug: string;
  tier: "fast" | "slow";
  check(fetchFn: typeof fetch): Promise<RetailerResult>;
}
```

- `src/lib/retailers/fetch.ts`: `politeFetch(url, init?): Promise<Response>` — wraps global fetch with 10s `AbortSignal.timeout`, browser-like headers (`User-Agent` Chrome/Win, `Accept-Language: de-AT,de;q=0.9`), throws `AdapterHttpError(status)` on non-2xx.
- `src/lib/retailers/registry.ts`: `export const adapters: RetailerAdapter[]` (filled by Tasks 5–6, starts empty array with type).

- [ ] **Step 1: Failing test** — `fetch.test.ts`: stub `fetch` (vi.fn) returning 403 → `politeFetch` rejects with `AdapterHttpError` carrying `status: 403`; returning 200 → resolves; assert UA + Accept-Language headers were sent.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: retailer adapter contract and polite fetch`

---

### Task 4: Endpoint discovery + fixtures (research task — no TDD)

**Files:**

- Create: `docs/retailers.md`, `src/lib/retailers/__fixtures__/<retailer>-*.json|html`

**Interfaces:**

- Produces: for each of bauhaus/obi/hornbach/mediamarkt/tepto and each variant they list: product page URL, article/SKU id, the JSON endpoint (or page) for online availability + price, the JSON endpoint for per-store availability (bauhaus/obi/hornbach/mediamarkt), request headers needed, and saved response fixtures (both current state and — if only one state is observable — a hand-edited copy representing the opposite stock state, clearly named `*-synthetic.json`).

- [ ] **Step 1:** Use `agent-browser` per retailer: `agent-browser open <product-search-url>`, find the PortaSplit / PortaSplit Cool product pages, open DevTools-equivalent via `agent-browser network requests` after entering a ZIP in the store-availability widget (use ZIP 1010 Wien) to capture the availability API calls.
- [ ] **Step 2:** Replay each captured endpoint with `curl` (same headers) to confirm it works outside a browser session; note any that 403 (mark adapter "best effort", plan HTML fallback).
- [ ] **Step 3:** Save raw responses as fixtures; document everything in `docs/retailers.md` (one section per retailer: product URLs, article IDs, endpoints, sample curl, quirks).
- [ ] **Step 4: Commit** `docs: retailer endpoint discovery and fixtures`

---

### Task 5: Fast-tier adapters (Bauhaus, Obi, Hornbach)

**Files:**

- Create: `src/lib/retailers/bauhaus.ts`, `src/lib/retailers/obi.ts`, `src/lib/retailers/hornbach.ts`
- Modify: `src/lib/retailers/registry.ts` (register all three)
- Test: `src/lib/retailers/__tests__/bauhaus.test.ts` (+ obi, + hornbach)

**Interfaces:**

- Consumes: `RetailerAdapter`, `politeFetch`, fixtures + `docs/retailers.md` from Task 4.
- Produces: `bauhausAdapter`, `obiAdapter`, `hornbachAdapter` — each `RetailerAdapter` with `tier: 'fast'`, returning offers for every variant the retailer lists and full `storeStock` for all Austrian stores.

Per adapter, same TDD cycle:

- [ ] **Step 1: Failing test** — inject a fake `fetchFn` that serves the saved fixtures keyed by URL. Assert: correct `retailerSlug`; one `OnlineOffer` per listed variant with exact expected `status`/`priceCents`/`url` from the fixture; `storeStock` length matches fixture store count; a known store (assert one concrete externalId, zip, inStock from fixture) parses exactly. Second test: fetchFn rejects → `check` throws (poller handles it); third test: malformed JSON body → throws.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement parser** against the documented endpoint shape. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** per adapter: `feat: bauhaus adapter` etc.

---

### Task 6: Slow-tier adapters (MediaMarkt, Tepto)

**Files:**

- Create: `src/lib/retailers/mediamarkt.ts`, `src/lib/retailers/tepto.ts`
- Modify: `src/lib/retailers/registry.ts`
- Test: `src/lib/retailers/__tests__/mediamarkt.test.ts`, `.../tepto.test.ts`

**Interfaces:**

- Consumes/Produces: same contract as Task 5; `tier: 'slow'`. Tepto: `storeStock: null`, HTML parsing with a small regex/string extraction (no cheerio unless needed — if needed, `pnpm add cheerio` is acceptable). MediaMarkt: GraphQL/JSON endpoints from Task 4; if blocked outside browsers, implement anyway against fixtures and let runtime yield `unknown` via thrown `AdapterHttpError`.

- [ ] Same 5-step TDD cycle per adapter as Task 5. Commit each.

---

### Task 7: Diff engine + persistence

**Files:**

- Create: `src/lib/diff.ts`, `src/lib/state.ts`
- Test: `src/lib/__tests__/diff.test.ts`, `src/lib/__tests__/state.test.ts`

**Interfaces:**

- Consumes: `RetailerResult`, db tables from Task 2.
- Produces:

```ts
// src/lib/diff.ts  (pure — no DB)
export interface OfferState {
  status: StockStatus;
  priceCents: number | null;
}
export interface PrevState {
  offers: Map<string, OfferState>; // key: `${variant}`
  storeStock: Map<string, boolean>; // key: `${externalId}:${variant}`
}
export interface StockEvent {
  type: "online_restock" | "online_soldout" | "price_change" | "store_restock" | "store_soldout";
  retailerSlug: string;
  variantSlug: VariantSlug;
  storeExternalId?: string;
  priceCents?: number | null;
}
export function computeDiff(prev: PrevState, result: RetailerResult): StockEvent[];

// src/lib/state.ts  (DB glue — all async, AppDb = TypeORM DataSource)
export function loadPrevState(db: AppDb, retailerSlug: string): Promise<PrevState>;
export function persistResult(db: AppDb, result: RetailerResult, evts: StockEvent[], now: number): Promise<void>; // upserts offers/stores/storeAvailability (sets lastCheckedAt=now, lastChangedAt on change), inserts events rows (resolving storeExternalId→storeId)
export function markUnknown(db: AppDb, retailerSlug: string, now: number): Promise<void>; // sets all offers of retailer to 'unknown'
```

- [ ] **Step 1: Failing tests for `computeDiff`** — table-driven cases:
  - out_of_stock → in_stock ⇒ `online_restock`
  - unknown → in_stock ⇒ `online_restock`
  - in_stock → out_of_stock ⇒ `online_soldout`
  - in_stock → in_stock with different price ⇒ `price_change` only
  - unseen variant (no prev entry) arriving as in_stock ⇒ `online_restock`; arriving as out_of_stock ⇒ **no event**
  - store false→true ⇒ `store_restock`; true→false ⇒ `store_soldout`; unseen store in stock ⇒ `store_restock`; unseen store out of stock ⇒ no event
  - `storeStock: null` ⇒ no store events
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5:** Commit `feat: diff engine`.
- [ ] **Step 6: Failing tests for state.ts** with `createDb(':memory:')`: persist a result twice → second `loadPrevState` reflects it; store row upserted not duplicated; events rows written with resolved storeId; `markUnknown` flips statuses.
- [ ] **Step 7–9:** Implement, run green, commit `feat: state persistence`.

---

### Task 8: Austrian PLZ geo lookup

**Files:**

- Create: `scripts/build-plz.ts`, `src/data/plz-at.json` (generated, committed), `src/lib/geo.ts`
- Test: `src/lib/__tests__/geo.test.ts`

**Interfaces:**

- Produces:

```ts
// src/lib/geo.ts
export function plzToLatLng(zip: string): { lat: number; lng: number } | null;
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number; // haversine
```

- [ ] **Step 1:** `scripts/build-plz.ts`: download `https://download.geonames.org/export/zip/AT.zip` (CC-BY 4.0 — add attribution line to README + `/datenschutz`), unzip `AT.txt` (TSV: country, zip, name, ..., lat col 10, lng col 11 — verify columns), aggregate duplicate ZIPs by averaging coords, emit `src/data/plz-at.json` as `{ "1010": [48.209, 16.37], ... }`. Run it once: `pnpm tsx scripts/build-plz.ts`.
- [ ] **Step 2: Failing test:** `plzToLatLng('1010')` ≈ {48.2, 16.37} (±0.1); unknown `'0000'` → null; `distanceKm` Vienna↔Linz ≈ 154 (±10).
- [ ] **Steps 3–4:** Implement, green. **Step 5:** Commit `feat: austrian plz geo lookup (GeoNames CC-BY)`.

---

### Task 9: Web Push — subscribe API + sender

**Files:**

- Create: `src/lib/notify/push.ts`, `src/app/api/subscribe/push/route.ts`
- Test: `src/lib/notify/__tests__/push.test.ts`

**Interfaces:**

- Consumes: `pushSubscriptions` table, `getDb`.
- Produces:

```ts
// src/lib/notify/push.ts
export interface PushPayload {
  title: string;
  body: string;
  url: string;
}
export function sendPush(db: AppDb, subId: number, payload: PushPayload, webpushImpl?: typeof webpush): Promise<"sent" | "gone" | "failed">;
// 'gone' (404/410 from push service) ⇒ row deleted from pushSubscriptions
```

- Route `POST /api/subscribe/push` body: `{ endpoint, keys: { p256dh, auth }, variantSlugs: string[], zip?: string, radiusKm?: number }` → upsert by endpoint, 200 `{ ok: true }`. `DELETE` body `{ endpoint }` → remove. Validate: variantSlugs ⊆ known slugs, zip matches `/^\d{4}$/` and resolvable via `plzToLatLng`, radiusKm 1–200.

- [ ] **Step 1: Failing tests:** with in-memory db + mocked webpush impl: success → 'sent' + row in `notificationLog` NOT written here (that's Task 11's job — sender is dumb); mock rejects with `{statusCode: 410}` → 'gone' + row deleted; other error → 'failed', row kept.
- [ ] **Steps 2–4:** Implement (`web-push` configured from `VAPID_*` env), green.
- [ ] **Step 5:** Route handlers with zod-free manual validation (keep deps light). Test validation via direct function call on the route's exported helpers if trivial, else covered by integration usage.
- [ ] **Step 6: Commit** `feat: web push subscriptions and sender`

---

### Task 10: Email — Resend double opt-in

**Files:**

- Create: `src/lib/notify/email.ts`, `src/app/api/subscribe/email/route.ts`, `src/app/api/subscribe/email/confirm/route.ts`, `src/app/api/subscribe/email/unsubscribe/route.ts`
- Test: `src/lib/notify/__tests__/email.test.ts`

**Interfaces:**

- Produces:

```ts
// src/lib/notify/email.ts
export function createEmailSubscription(
  db: AppDb,
  input: { email: string; variantSlugs: string[]; zip?: string; radiusKm?: number },
  send?: SendFn,
): Promise<"created" | "resent" | "invalid">; // generates tokens (crypto.randomUUID), sends confirm mail with link `${PUBLIC_BASE_URL}/api/subscribe/email/confirm?token=...`
export function confirmEmail(db: AppDb, token: string): boolean;
export function unsubscribeEmail(db: AppDb, token: string): boolean;
export function sendAlertEmail(db: AppDb, subId: number, subject: string, html: string, send?: SendFn): Promise<"sent" | "failed">; // html must include unsubscribe link
export type SendFn = (to: string, subject: string, html: string) => Promise<void>; // default impl wraps Resend
```

- [ ] **Step 1: Failing tests** (in-memory db, `send` = vi.fn): create → row unconfirmed + confirm mail sent; duplicate email → 'resent' (new token, mail re-sent); bad email → 'invalid', no send; confirm with token → confirmed=true, wrong token → false; unsubscribe deletes row.
- [ ] **Steps 2–4:** Implement, green. Routes: POST subscribe (rate-limit naive: max 5/min per IP via in-memory Map), GET confirm/unsubscribe return tiny German HTML pages ("E-Mail bestätigt ✓ / Abgemeldet ✓").
- [ ] **Step 5: Commit** `feat: email subscriptions with double opt-in`

---

### Task 11: Notifier orchestration

**Files:**

- Create: `src/lib/notify/orchestrator.ts`
- Test: `src/lib/notify/__tests__/orchestrator.test.ts`

**Interfaces:**

- Consumes: `StockEvent[]`, subscriptions tables, `sendPush`, `sendAlertEmail`, `plzToLatLng`, `distanceKm`, `notificationLog`.
- Produces:

```ts
export async function notifyEvents(
  db: AppDb,
  events: StockEvent[],
  now: number,
  deps?: { push?: typeof sendPush; email?: typeof sendAlertEmail },
): Promise<{ pushed: number; emailed: number }>;
```

Rules (test each):

- Only `online_restock` and `store_restock` notify; other events ignored.
- Recipient match: subscription's `variantSlugs` includes the event's variant. For `store_restock` additionally: subscriber has zip+radius AND store within radius (store coords from `stores` table); subscribers **without** zip get online events only.
- Dedupe/cooldown: skip if `notificationLog` has same `(channel, subscriptionId, dedupeKey)` with `sentAt > now - 60min`. dedupeKey: `online:{retailer}:{variant}` / `store:{retailer}:{storeExternalId}:{variant}`.
- Email only to `confirmed` subscriptions.
- German message copy: title `"🟢 {VariantName} bestellbar!"`, body `"Jetzt bei {Retailer} um {Preis} bestellbar"` (price formatted `1.199,00 €`, omit clause if null) / store: `"Bei {Retailer} {StoreName} ({zip} {city}) verfügbar"`. `url` = offer url.
- Log every send in `notificationLog`.

- [ ] **Step 1: Failing tests** covering every rule above with mocked push/email deps (assert exact call args incl. German copy for one case). **Steps 2–4:** implement, green. **Step 5: Commit** `feat: notification orchestrator with cooldown and geo matching`

---

### Task 12: Poller + admin trigger

**Files:**

- Create: `src/lib/poller.ts`, `src/instrumentation.ts`, `src/app/api/admin/check/route.ts`
- Test: `src/lib/__tests__/poller.test.ts`

**Interfaces:**

- Consumes: `adapters` registry, `loadPrevState`/`computeDiff`/`persistResult`/`markUnknown`, `notifyEvents`, `checkRuns`.
- Produces:

```ts
// src/lib/poller.ts
export interface TickSummary {
  ran: string[];
  events: number;
  errors: Record<string, string>;
  durationMs: number;
}
export async function runTick(
  db: AppDb,
  opts: { now: number; force?: boolean; adapterList?: RetailerAdapter[]; fetchFn?: typeof fetch; notify?: typeof notifyEvents },
): Promise<TickSummary>;
export function startPoller(): void; // reads env, setInterval(POLL_FAST_MS), guards overlap + backoff
```

Behavior (test via `runTick` with fake adapters/clock — never real HTTP):

- Due-ness: per adapter track `lastRunAt` (module-level Map, injectable); fast runs when `now - lastRunAt >= POLL_FAST_MS`, slow `>= POLL_SLOW_MS`; `force: true` runs all.
- Adapter throws ⇒ `markUnknown` after **3 consecutive** failures (track consecutive-failure count; before that keep last state), error recorded in summary, other adapters still run.
- Backoff: after a throw with `AdapterHttpError` 403/429, that adapter's effective interval doubles (cap 30 min) until a success resets it.
- Each tick writes one `checkRuns` row. Overlap guard: if previous tick still running, skip (module flag).
- Housekeeping: roughly every 100th tick, delete `events` older than 90 days and `checkRuns` older than 7 days.
- `startPoller` only if `ENABLE_POLLER === '1'`; `instrumentation.ts` `register()` calls it when `process.env.NEXT_RUNTIME === 'nodejs'`.
- `POST /api/admin/check` with `Authorization: Bearer ${ADMIN_SECRET}` → `runTick(force:true)`, returns summary JSON; 401 otherwise.

- [ ] **Step 1: Failing tests** for due-ness, error isolation, 3-strike markUnknown, backoff, summary shape. **Steps 2–4:** implement, green. **Step 5: Commit** `feat: in-process poller with tiering and backoff`

---

### Task 13: Frontend — main page

**Files:**

- Create: `src/app/page.tsx`, `src/app/api/status/route.ts`, `src/app/api/stores/route.ts`, `src/components/StatusCard.tsx`, `src/components/StoreFinder.tsx`, `src/components/EventFeed.tsx`, `src/components/LiveRefresh.tsx`, `src/lib/queries.ts`, `src/lib/format.ts`
- Modify: `src/app/layout.tsx` (metadata, German lang, header/footer)
- Test: `src/lib/__tests__/format.test.ts`, `src/lib/__tests__/queries.test.ts`

**Interfaces:**

- Consumes: db tables; Produces for Task 14: page slots a `<SubscribePanel />` placeholder imported from `src/components/SubscribePanel.tsx` (Task 14 creates it; until then export a stub from Task 13 rendering `null`).

```ts
// src/lib/queries.ts
export interface VariantStatus {
  variant: { slug: VariantSlug; name: string; uvpCents: number };
  offers: Array<{
    retailerSlug: string;
    retailerName: string;
    url: string;
    priceCents: number | null;
    status: StockStatus;
    lastCheckedAt: number;
    lastChangedAt: number;
  }>;
}
export function getVariantStatuses(db: AppDb): Promise<VariantStatus[]>;
export function getRecentEvents(
  db: AppDb,
  limit?: number,
): Promise<
  Array<{ type: string; retailerName: string; variantName: string; storeName: string | null; priceCents: number | null; createdAt: number }>
>;
export function findStoresNear(
  db: AppDb,
  zip: string,
  radiusKm: number,
  variant?: VariantSlug,
): Promise<Array<{ retailerName: string; name: string; zip: string; city: string; distanceKm: number; inStock: boolean; lastCheckedAt: number }>>; // sorted by distance, in-stock first
// src/lib/format.ts
export function formatPrice(cents: number | null): string; // 119900 → "1.199,00 €", null → "–"
export function formatRelativeTime(ts: number, now: number): string; // "vor 2 Min", "vor 3 Std", "gerade eben"
```

Page layout (server component, `export const revalidate = 30` not usable with dynamic db → use `dynamic = 'force-dynamic'` + client refresh):

- Header: „Wo is meine Porta?" + einzeiler „Live-Verfügbarkeit der Midea PortaSplit in Österreich".
- Two variant sections side-by-side (grid, stacks on mobile): variant name, UVP, then a `StatusCard` per retailer: colored status dot + „Bestellbar"/„Ausverkauft"/„Status unbekannt", price, „Zum Shop →" link (rel=nofollow, target \_blank), „geprüft vor X Min".
- `<SubscribePanel />` between sections and store finder.
- `StoreFinder` (client): PLZ input + radius select (10/25/50/100 km) + variant toggle → fetches `/api/stores?zip=&radius=&variant=` → table of stores (chain, name, distance, status dot). Empty state: „Keine Filiale mit Bestand gefunden 😞".
- `EventFeed`: last 30 events as timeline lines, e.g. „🟢 BAUHAUS: PortaSplit wieder bestellbar — vor 12 Min".
- `LiveRefresh` (client): `router.refresh()` every 30s via `setInterval` when tab visible.
- `/api/status`: JSON of `getVariantStatuses` (used by future consumers; cheap). `/api/stores`: validates params, uses `findStoresNear`.
- Footer: Links Impressum/Datenschutz, GeoNames attribution, „Kein Shop — wir verlinken nur."

- [ ] **Step 1: Failing tests** for `format.ts` (cases above) and `queries.ts` (in-memory db seeded with 1 offer/2 stores/2 events → exact expected shapes, distance sort, in-stock-first).
- [ ] **Steps 2–4:** Implement lib, green. **Step 5:** Build the page/components (visual work — verify via `pnpm dev` + agent-browser screenshot; no component unit tests). Tailwind: clean, high-contrast, mobile-first; status colors green/red/gray.
- [ ] **Step 6:** `pnpm build` passes. **Step 7: Commit** `feat: main page with live status, store finder, event feed`

---

### Task 14: PWA + subscribe UI

**Files:**

- Create: `public/sw.js`, `public/manifest.webmanifest`, `src/components/SubscribePanel.tsx` (replaces stub), `src/app/api/push-key/route.ts`, `public/icon-192.png`, `public/icon-512.png` (generate simple AC-unit emoji-on-gradient PNGs via a small script or ImageMagick)
- Modify: `src/app/layout.tsx` (manifest link, theme color)

**Interfaces:**

- Consumes: `POST/DELETE /api/subscribe/push` (Task 9), `POST /api/subscribe/email` (Task 10), `GET /api/push-key` → `{ publicKey: VAPID_PUBLIC_KEY }`.

- [ ] **Step 1:** `sw.js`: `push` event → `self.registration.showNotification(data.title, { body, data: { url }, icon: '/icon-192.png' })`; `notificationclick` → `clients.openWindow(event.notification.data.url)`.
- [ ] **Step 2:** `SubscribePanel` (client component): checkboxes per variant (default both), optional „Filial-Alarm" expander (PLZ + Radius), two actions: „🔔 Push aktivieren" (register sw → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → POST) and email form (input + „Benachrichtigen"). States: success („Alarm aktiv ✓" + „Deaktivieren" for push), permission denied hint, iOS hint („Auf iPhone: Seite zum Home-Bildschirm hinzufügen, dann Push aktivieren"), email → „Bestätigungs-Mail verschickt — bitte Postfach checken".
- [ ] **Step 3:** Manual verification with agent-browser: subscribe flow stores a row (check via sqlite CLI); trigger `/api/admin/check` with a fake-restock (temporarily flip an offer row to out_of_stock via sqlite, then run tick with fixture adapter) → notification received in headed browser.
- [ ] **Step 4:** `pnpm build` green. **Step 5: Commit** `feat: pwa push subscribe panel and service worker`

---

### Task 15: Legal pages, Dockerfile, README, deploy

**Files:**

- Create: `src/app/impressum/page.tsx`, `src/app/datenschutz/page.tsx`, `Dockerfile`, `.dockerignore`, `README.md`

**Interfaces:** none downstream.

- [ ] **Step 1:** Impressum: placeholder block with TODO-comment for Julian (name/address per §5 ECG). Datenschutz: real draft in German covering: push subscription data (endpoint/keys, purpose, deletion), email double-opt-in data, no cookies/tracking, GeoNames attribution, Resend as processor, hosting on own server.
- [ ] **Step 2:** `Dockerfile` (multi-stage): `node:22-alpine` deps→build (`pnpm build`, needs `corepack enable`)→runtime copying `.next/standalone`, `.next/static`, `public`; `ENV DATABASE_PATH=/data/app.db ENABLE_POLLER=1 PORT=3000`; `VOLUME /data`; non-root user; `CMD ["node", "server.js"]`. Note: better-sqlite3 native build needs `apk add python3 make g++` in deps stage only.
- [ ] **Step 3:** Verify locally: `docker build -t woismeineporta . && docker run -p 3000:3000 -v $(pwd)/data:/data --env-file .env woismeineporta` → page loads, poller logs ticks.
- [ ] **Step 4:** README: what it is, dev setup (`pnpm i`, `.env`, `pnpm dev`), generating VAPID keys (`npx web-push generate-vapid-keys`), test commands, Dokploy deployment walkthrough (app from Git repo → Dockerfile build, volume `/data`, 1 replica, domain + HTTPS via Traefik, env vars list), Resend setup (domain verify, `RESEND_API_KEY`), GeoNames CC-BY attribution.
- [ ] **Step 5:** Full check: `pnpm test && pnpm build` green. **Step 6: Commit** `feat: legal pages, dockerfile, deployment docs`

---

## Self-review notes

- Spec coverage: all spec sections map to tasks (retailers→4–6, diff→7, geo→8, push→9, email→10, notify rules→11, poller/tiering/backoff→12, pages/feed/finder→13, PWA/iOS→14, legal/Docker/README→15). Event pruning (90d events / 7d check_runs): fold into Task 12 — `runTick` deletes old rows once per ~100 ticks. ✔ added to Task 12 scope.
- Type consistency: `storeStock` naming used consistently (not `storeAvailability`) in adapter results; DB table stays `storeAvailability`. `RetailerResult.retailerSlug` matches diff/state consumers.
- Placeholders: Impressum placeholder is an explicit user-content gap, flagged for Julian — intentional.
