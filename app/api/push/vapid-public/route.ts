import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push";

export async function GET() {
  const key = getVapidPublicKey();
  if (!key) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  return NextResponse.json({ publicKey: key });
}
