import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { plzToLatLng } from "@/lib/geo";
import { findStoresNear, findStoresNearPoint, listAllStores } from "@/lib/queries";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { VARIANT_SLUGS } from "@/lib/variants";
import type { VariantSlug } from "@/lib/retailers/types";

// Rough Austria bounding box — reject obviously-off device coordinates.
const AT_BBOX = { latMin: 46.3, latMax: 49.1, lngMin: 9.4, lngMax: 17.2 };
function inAustria(lat: number, lng: number): boolean {
  return lat >= AT_BBOX.latMin && lat <= AT_BBOX.latMax && lng >= AT_BBOX.lngMin && lng <= AT_BBOX.lngMax;
}

// Public, DB-hitting endpoint — generous per-IP cap to blunt abuse.
const rateLimited = createRateLimiter(60, 60_000);

export async function GET(request: Request) {
  if (rateLimited(clientIp(request))) {
    return NextResponse.json({ error: "zu viele Anfragen" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const params = new URL(request.url).searchParams;
  const zip = params.get("zip") ?? "";
  const lat = params.has("lat") ? Number(params.get("lat")) : null;
  const lng = params.has("lng") ? Number(params.get("lng")) : null;
  const radius = Math.min(Math.max(Number.parseInt(params.get("radius") ?? "50", 10) || 50, 1), 300);
  const variantParam = params.get("variant");
  const variant = variantParam && (VARIANT_SLUGS as readonly string[]).includes(variantParam) ? (variantParam as VariantSlug) : undefined;

  // Store availability changes at most once per poll tick; cacheable briefly.
  const cache = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" };

  // Device geolocation search.
  if (lat !== null && lng !== null) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inAustria(lat, lng)) {
      return NextResponse.json({ error: "Standort außerhalb Österreichs" }, { status: 400 });
    }
    const center = { lat, lng };
    const stores = await findStoresNearPoint(await getDb(), center, radius, variant);
    return NextResponse.json({ stores, center, radiusKm: radius }, { headers: cache });
  }

  // Without a ZIP: full store list for the map view.
  if (!zip) {
    const stores = await listAllStores(await getDb(), variant);
    return NextResponse.json({ stores, center: null, radiusKm: null }, { headers: cache });
  }

  if (!/^\d{4}$/.test(zip) || !plzToLatLng(zip)) {
    return NextResponse.json({ error: "PLZ ungültig" }, { status: 400 });
  }
  const stores = await findStoresNear(await getDb(), zip, radius, variant);
  return NextResponse.json({ stores, center: plzToLatLng(zip), radiusKm: radius }, { headers: cache });
}
