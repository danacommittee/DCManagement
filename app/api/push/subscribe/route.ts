import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";
import { saveSubscription, isPushConfigured } from "@/lib/push";

export async function POST(req: NextRequest) {
  if (!isPushConfigured()) {
    return NextResponse.json({ error: "Push notifications are not configured" }, { status: 503 });
  }
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await authAdmin.verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    const membersSnap = await db.collection("members").where("email", "==", email).limit(1).get();
    if (membersSnap.empty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const userId = membersSnap.docs[0].id;

    const body = await req.json();
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const keys = body.keys && typeof body.keys === "object" ? body.keys : null;
    const p256dh = keys?.p256dh && typeof keys.p256dh === "string" ? keys.p256dh : "";
    const auth = keys?.auth && typeof keys.auth === "string" ? keys.auth : "";
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Invalid subscription: endpoint and keys.p256dh, keys.auth required" }, { status: 400 });
    }

    const userAgent = req.headers.get("user-agent") ?? undefined;
    await saveSubscription(userId, { endpoint, keys: { p256dh, auth } }, userAgent);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
