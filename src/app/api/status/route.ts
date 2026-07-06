import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getVariantStatuses } from "@/lib/queries";

export async function GET() {
  const statuses = await getVariantStatuses(await getDb());
  // Data changes at most once per poll tick (30s) — safe for shared caches to
  // hold briefly; without a CDN this is simply ignored.
  return NextResponse.json(
    { statuses, generatedAt: Date.now() },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
  );
}
