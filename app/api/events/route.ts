import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await authAdmin.verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    const membersSnap = await db.collection("members").where("email", "==", email).limit(1).get();
    if (membersSnap.empty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const upcoming = searchParams.get("upcoming") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    let query = db.collection("events").orderBy("dateFrom", "desc").limit(limit);
    const snap = await query.get();
    let events = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
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
    });
    if (upcoming) {
      const now = new Date().toISOString();
      events = events.filter((e) => e.dateTo >= now);
      events.reverse();
    }
    return NextResponse.json({ events });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

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
      return NextResponse.json({ error: "Only Super Admin can create events" }, { status: 403 });
    }

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const dateFrom = typeof body.dateFrom === "string" ? body.dateFrom.trim() : "";
    const dateTo = typeof body.dateTo === "string" ? body.dateTo.trim() : "";
    const teamIds = Array.isArray(body.teamIds) ? (body.teamIds as string[]).filter((id: unknown) => typeof id === "string") : [];

    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    if (!dateFrom || !dateTo) return NextResponse.json({ error: "dateFrom and dateTo required" }, { status: 400 });
    if (new Date(dateFrom) > new Date(dateTo)) return NextResponse.json({ error: "dateFrom must be before dateTo" }, { status: 400 });

    const now = Date.now();
    const ref = await db.collection("events").add({
      name,
      dateFrom,
      dateTo,
      teamIds,
      teamOverrides: body.teamOverrides != null ? body.teamOverrides : {},
      createdBy: membersSnap.docs[0].id,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ id: ref.id, name });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
