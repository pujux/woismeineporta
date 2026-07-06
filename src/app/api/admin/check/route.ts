import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { runTick } from "@/lib/poller";

export async function POST(request: Request) {
  const secret = process.env.ADMIN_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await runTick(await getDb(), { now: Date.now(), force: true });
  return NextResponse.json(summary);
}
