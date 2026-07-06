import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { createEmailSubscription } from "@/lib/notify/email";

// Per-IP rate limit: 5 requests/minute. In-memory (single container); the map
// is swept each call so idle IPs don't accumulate.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string, now = Date.now()): boolean {
  for (const [key, times] of hits) {
    const fresh = times.filter((t) => now - t < WINDOW_MS);
    if (fresh.length) hits.set(key, fresh);
    else hits.delete(key);
  }
  const recent = hits.get(ip) ?? [];
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  // Trustworthy only behind the reverse proxy (Traefik/Dokploy sets XFF).
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
