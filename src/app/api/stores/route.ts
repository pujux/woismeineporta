import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { plzToLatLng } from "@/lib/geo";
import { findStoresNear, listAllStores } from "@/lib/queries";
import { VARIANT_SLUGS } from "@/lib/variants";
import type { VariantSlug } from "@/lib/retailers/types";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const zip = params.get("zip") ?? "";
  const radius = Math.min(Math.max(parseInt(params.get("radius") ?? "50", 10) || 50, 1), 300);
  const variantParam = params.get("variant");
  const variant =
    variantParam && (VARIANT_SLUGS as readonly string[]).includes(variantParam)
      ? (variantParam as VariantSlug)
      : undefined;

  // Without a ZIP: full store list for the map view.
  if (!zip) {
    const stores = await listAllStores(await getDb(), variant);
    return NextResponse.json({ stores, center: null, radiusKm: null });
  }

  if (!/^\d{4}$/.test(zip) || !plzToLatLng(zip)) {
    return NextResponse.json({ error: "PLZ ungültig" }, { status: 400 });
  }
  const stores = await findStoresNear(await getDb(), zip, radius, variant);
  return NextResponse.json({ stores, center: plzToLatLng(zip), radiusKm: radius });
}
