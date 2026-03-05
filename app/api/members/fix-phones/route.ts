import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";
import { toE164 } from "@/lib/phone";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const decoded = await authAdmin.verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    const membersSnap = await db.collection("members").where("email", "==", email).limit(1).get();
    if (membersSnap.empty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const me = membersSnap.docs[0].data();
    if (me.role !== "super_admin") {
      return NextResponse.json({ error: "Only Super Admin can fix phone numbers" }, { status: 403 });
    }

    const snap = await db.collection("members").get();
    let updated = 0;
    let scanned = 0;
    let batch = db.batch();
    let batchSize = 0;
    const now = Date.now();

    for (const doc of snap.docs) {
      const data = doc.data();
      const rawPhone = typeof data.phone === "string" ? data.phone : "";
      const normalized = toE164(rawPhone);
      scanned += 1;
      if (!normalized || normalized === rawPhone) continue;

      batch.update(doc.ref, { phone: normalized, updatedAt: now });
      updated += 1;
      batchSize += 1;

      if (batchSize >= 400) {
        await batch.commit();
        batch = db.batch();
        batchSize = 0;
      }
    }

    if (batchSize > 0) {
      await batch.commit();
    }

    return NextResponse.json({ ok: true, updated, scanned });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

