import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";

export async function GET(
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

    const { id } = await params;
    const snap = await db.collection("events").doc(id).get();
    if (!snap.exists) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    const x = snap.data()!;
    const event = {
      id: snap.id,
      name: x.name,
      dateFrom: x.dateFrom,
      dateTo: x.dateTo,
      teamIds: Array.isArray(x.teamIds) ? x.teamIds : [],
      teamOverrides: x.teamOverrides != null ? x.teamOverrides : undefined,
      overallStartTime: x.overallStartTime,
      overallEndTime: x.overallEndTime,
      createdBy: x.createdBy,
      createdAt: x.createdAt,
      updatedAt: x.updatedAt,
    };
    const teamIds = event.teamIds;
    const teamsSnap = await db.collection("teams").get();
    const teams = teamsSnap.docs
      .filter((d) => teamIds.includes(d.id))
      .map((d) => {
        const t = d.data();
        const override = event.teamOverrides?.[d.id];
        return {
          id: d.id,
          name: t.name,
          leaderId: override?.leaderId != null ? override.leaderId : t.leaderId ?? null,
          memberIds: Array.isArray(override?.memberIds) ? override.memberIds : (Array.isArray(t.memberIds) ? t.memberIds : []),
          dayOfWeek: t.dayOfWeek,
          isWrapUp: t.isWrapUp === true,
        };
      });
    return NextResponse.json({ event: { ...event, teams } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

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
    if (membersSnap.docs[0].data().role !== "super_admin") {
      return NextResponse.json({ error: "Only Super Admin can update events" }, { status: 403 });
    }

    const { id } = await params;
    const snap = await db.collection("events").doc(id).get();
    if (!snap.exists) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const body = await req.json();
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (typeof body.name === "string") updates.name = body.name.trim();
    if (typeof body.dateFrom === "string") updates.dateFrom = body.dateFrom.trim();
    if (typeof body.dateTo === "string") updates.dateTo = body.dateTo.trim();
    if (Array.isArray(body.teamIds)) updates.teamIds = body.teamIds;
    if (body.teamOverrides !== undefined) updates.teamOverrides = body.teamOverrides;
    if (typeof body.overallStartTime === "string" || typeof body.overallEndTime === "string") {
      const evData = snap.data()!;
      const eventEndDate = (evData.dateTo as string).slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      if (eventEndDate > today) {
        return NextResponse.json({ error: "Cannot set overall event time for future events" }, { status: 403 });
      }
      if (typeof body.overallStartTime === "string") updates.overallStartTime = body.overallStartTime.trim() || null;
      if (typeof body.overallEndTime === "string") updates.overallEndTime = body.overallEndTime.trim() || null;
    }

    await db.collection("events").doc(id).update(updates);
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
      return NextResponse.json({ error: "Only Super Admin can delete events" }, { status: 403 });
    }
    const { id } = await params;
    await db.collection("events").doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
