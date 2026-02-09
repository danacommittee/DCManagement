import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

/**
 * GET /api/health - Check that Firebase Admin is initialized (for debugging 401 on auth/me).
 * Safe to call unauthenticated.
 */
export async function GET() {
  try {
    await db.collection("members").limit(1).get();
    return NextResponse.json({ ok: true, firebase: "initialized", firestore: "ok" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[health] Firebase check failed:", message);
    return NextResponse.json(
      { ok: false, firebase: "failed", error: message },
      { status: 503 }
    );
  }
}
