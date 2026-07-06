import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { createEmailSubscription } from "@/lib/notify/email";

// naive per-IP rate limit: 5 requests/minute
const hits = new Map<string, number[]>();
function rateLimited(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "zu viele Anfragen" }, { status: 429 });
  }
  let body: { email?: string; variantSlugs?: string[]; zip?: string; radiusKm?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const result = await createEmailSubscription(await getDb(), {
    email: body.email ?? "",
    variantSlugs: body.variantSlugs ?? [],
    zip: body.zip,
    radiusKm: body.radiusKm,
  });
  if (result === "invalid") {
    return NextResponse.json({ error: "ungültige Eingabe" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, result });
}
