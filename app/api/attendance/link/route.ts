import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await authAdmin.verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    const membersSnap = await db.collection("members").where("email", "==", email).limit(1).get();
    if (membersSnap.empty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (membersSnap.docs[0].data().role !== "super_admin" && membersSnap.docs[0].data().role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const teamId = body.teamId;
    if (!teamId) return NextResponse.json({ error: "teamId required" }, { status: 400 });
    const teamSnap = await db.collection("teams").doc(teamId).get();
    if (!teamSnap.exists) return NextResponse.json({ error: "Team not found" }, { status: 400 });

    const secret = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await db.collection("attendance_links").add({
      teamId,
      secret,
      expiresAt,
      createdAt: Date.now(),
    });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const link = `${baseUrl}/attendance/submit?token=${secret}&teamId=${teamId}`;
    return NextResponse.json({ link, expiresAt });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
