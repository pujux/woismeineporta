import { NextResponse } from "next/server";

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ error: "push not configured" }, { status: 503 });
  }
  return NextResponse.json({ publicKey });
}
