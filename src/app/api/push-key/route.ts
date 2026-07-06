import { NextResponse } from "next/server";

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ error: "push not configured" }, { status: 503 });
  }
  // The VAPID public key is a stable deployment constant — cache hard.
  return NextResponse.json({ publicKey }, { headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } });
}
