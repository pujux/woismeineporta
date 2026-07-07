import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { deletePushSubscription, upsertPushSubscription, validatePushInput } from "@/lib/notify/push";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

const rateLimited = createRateLimiter(10, 60_000);

export async function POST(request: Request) {
  if (rateLimited(clientIp(request))) {
    return NextResponse.json({ error: "zu viele Anfragen" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const input = validatePushInput(body);
  if (!input) return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  await upsertPushSubscription(await getDb(), input, Date.now());
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  let body: { endpoint?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.endpoint !== "string") {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }
  await deletePushSubscription(await getDb(), body.endpoint);
  return NextResponse.json({ ok: true });
}
