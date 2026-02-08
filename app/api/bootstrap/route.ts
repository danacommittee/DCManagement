import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

/**
 * One-time bootstrap: create the first Super Admin member.
 * Call with POST body: { "email": "your@email.com", "name": "Your Name", "secret": "YOUR_BOOTSTRAP_SECRET" }
 * Set BOOTSTRAP_SECRET in .env.local. Only works when the members collection is empty.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.BOOTSTRAP_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Set BOOTSTRAP_SECRET in .env.local to use bootstrap." },
      { status: 501 }
    );
  }
  try {
    const body = await req.json();
    if (body.secret !== secret) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 403 });
    }
    const email = (body.email as string)?.toLowerCase()?.trim();
    const name = (body.name as string)?.trim() || "Super Admin";
    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const membersSnap = await db.collection("members").limit(1).get();
    if (!membersSnap.empty) {
      return NextResponse.json(
        { error: "Members already exist. Use CSV upload or Members UI." },
        { status: 400 }
      );
    }

    const now = Date.now();
    await db.collection("members").add({
      email,
      name,
      phone: "",
      role: "super_admin",
      teamIds: [],
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({
      ok: true,
      message: "First Super Admin created. Sign in with Google using " + email,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
