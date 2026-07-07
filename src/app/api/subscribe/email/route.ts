import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { createEmailSubscription } from "@/lib/notify/email";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

// Per-IP: 5 signups/minute (on top of the per-address anti-bombing throttle).
const rateLimited = createRateLimiter(5, 60_000);

export async function POST(request: Request) {
  if (rateLimited(clientIp(request))) {
    return NextResponse.json({ error: "zu viele Anfragen" }, { status: 429, headers: { "Retry-After": "60" } });
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
