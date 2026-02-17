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
      dailyTimes: x.dailyTimes != null ? x.dailyTimes : undefined,
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
          leader2Id: override?.leader2Id != null ? override.leader2Id : t.leader2Id ?? null,
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
    if (body.dailyTimes !== undefined) {
      const evData = snap.data()!;
      const eventStartDate = (evData.dateFrom as string).slice(0, 10);
      const eventEndDate = (evData.dateTo as string).slice(0, 10);
      const todayStr = new Date().toISOString().slice(0, 10);
      // Only allow setting daily times on or after the event start date (no future events).
      if (todayStr < eventStartDate) {
        return NextResponse.json({ error: "Cannot set event times before the event starts" }, { status: 403 });
      }
      // Validate: all dates in dailyTimes must be within event range and not future
      const dailyTimes = body.dailyTimes as Record<string, { startTime?: string; endTime?: string }>;
      if (typeof dailyTimes === "object" && dailyTimes !== null) {
        for (const dateStr of Object.keys(dailyTimes)) {
          if (dateStr < eventStartDate || dateStr > eventEndDate) {
            return NextResponse.json({ error: `Date ${dateStr} is outside event range` }, { status: 400 });
          }
          if (dateStr > todayStr) {
            return NextResponse.json({ error: `Cannot set times for future date ${dateStr}` }, { status: 403 });
          }
        }
        updates.dailyTimes = dailyTimes;
      }
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
