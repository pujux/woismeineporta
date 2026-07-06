import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  deletePushSubscription,
  upsertPushSubscription,
  validatePushInput,
} from "@/lib/notify/push";

export async function POST(request: Request) {
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
