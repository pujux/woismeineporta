import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getVariantStatuses } from "@/lib/queries";

export async function GET() {
  const statuses = await getVariantStatuses(await getDb());
  return NextResponse.json({ statuses, generatedAt: Date.now() });
}
