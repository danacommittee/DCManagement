import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await authAdmin.verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    const membersSnap = await db.collection("members").where("email", "==", email).limit(1).get();
    if (membersSnap.empty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (membersSnap.docs[0].data().role !== "super_admin") {
      return NextResponse.json({ error: "Only Super Admin can delete all members" }, { status: 403 });
    }

    const snap = await db.collection("members").get();
    const BATCH_SIZE = 500;
    for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      snap.docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    return NextResponse.json({ ok: true, deleted: snap.size });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
