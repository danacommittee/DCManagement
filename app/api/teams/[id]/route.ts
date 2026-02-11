import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await authAdmin.verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    const membersSnap = await db.collection("members").where("email", "==", email).limit(1).get();
    if (membersSnap.empty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const myRole = membersSnap.docs[0].data().role;
    const myId = membersSnap.docs[0].id;

    const { id } = await params;
    const body = await req.json();
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (typeof body.name === "string") updates.name = body.name;
    if (body.leaderId !== undefined) updates.leaderId = body.leaderId;
    if (Array.isArray(body.memberIds)) updates.memberIds = body.memberIds;
    if (typeof body.dayOfWeek === "number" && body.dayOfWeek >= 0 && body.dayOfWeek <= 6) updates.dayOfWeek = body.dayOfWeek;
    if (body.isWrapUp !== undefined) updates.isWrapUp = body.isWrapUp === true;

    const teamSnap = await db.collection("teams").doc(id).get();
    if (!teamSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (myRole !== "super_admin" && teamSnap.data()?.leaderId !== myId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.collection("teams").doc(id).update(updates);

    if (Array.isArray(body.memberIds)) {
      const memberIds = body.memberIds as string[];
      const batch = db.batch();
      const memberSnaps = await db.collection("members").get();
      for (const d of memberSnaps.docs) {
        const teamIds = Array.isArray(d.data().teamIds) ? (d.data().teamIds as string[]) : [];
        const hasTeam = teamIds.includes(id);
        const shouldHave = memberIds.includes(d.id);
        if (hasTeam !== shouldHave) {
          let next = [...teamIds];
          if (shouldHave && !next.includes(id)) next = [...next, id];
          if (!shouldHave) next = next.filter((t) => t !== id);
          batch.update(d.ref, { teamIds: next, updatedAt: Date.now() });
        }
      }
      await batch.commit();
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = _req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await authAdmin.verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    const membersSnap = await db.collection("members").where("email", "==", email).limit(1).get();
    if (membersSnap.empty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (membersSnap.docs[0].data().role !== "super_admin") {
      return NextResponse.json({ error: "Only Super Admin can delete teams" }, { status: 403 });
    }
    const { id } = await params;
    await db.collection("teams").doc(id).delete();
    const memberSnaps = await db.collection("members").where("teamIds", "array-contains", id).get();
    const batch = db.batch();
    for (const d of memberSnaps.docs) {
      const teamIds = (Array.isArray(d.data().teamIds) ? (d.data().teamIds as string[]) : []).filter((t) => t !== id);
      batch.update(d.ref, { teamIds, updatedAt: Date.now() });
    }
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
