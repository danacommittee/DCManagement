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
    const myId = membersSnap.docs[0].id;
    const rawRole = membersSnap.docs[0].data().role;
    let myRole: "member" | "admin" | "super_admin" = "member";
    if (typeof rawRole === "string") {
      const n = rawRole.trim().toLowerCase().replace(/\s+/g, "_");
      if (n === "admin" || n === "super_admin") myRole = n;
    }

    const snap = await db.collection("teams").orderBy("name").get();
    let teams = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        name: x.name,
        leaderId: x.leaderId != null ? x.leaderId : null,
        leader2Id: x.leader2Id != null ? x.leader2Id : null,
        memberIds: Array.isArray(x.memberIds) ? x.memberIds : [],
        dayOfWeek: x.dayOfWeek !== undefined ? x.dayOfWeek : undefined,
        isWrapUp: x.isWrapUp === true,
        createdAt: x.createdAt,
        updatedAt: x.updatedAt,
      };
    });
    if (myRole === "admin") {
      teams = teams.filter((t) => t.leaderId === myId || t.leader2Id === myId);
    } else if (myRole === "member") {
      // For members, include base teams where they are in memberIds,
      // plus any teams where an active event's teamOverrides list includes them.
      const todayStr = new Date().toISOString().slice(0, 10);
      const eventsSnap = await db.collection("events").get();
      const extraTeamIds = new Set<string>();
      eventsSnap.docs.forEach((d) => {
        const x = d.data() as {
          dateFrom?: string;
          dateTo?: string;
          teamOverrides?: Record<string, { memberIds?: string[] }>;
        };
        const from = (x.dateFrom ?? "").slice(0, 10);
        const to = (x.dateTo ?? "").slice(0, 10);
        if (!from || !to) return;
        if (todayStr < from || todayStr > to) return;
        const overrides = x.teamOverrides;
        if (!overrides || typeof overrides !== "object") return;
        for (const [teamId, ov] of Object.entries(overrides)) {
          if (Array.isArray(ov.memberIds) && ov.memberIds.includes(myId)) {
            extraTeamIds.add(teamId);
          }
        }
      });
      teams = teams.filter((t) => t.memberIds.includes(myId) || extraTeamIds.has(t.id));
    }
    return NextResponse.json({ teams });
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
      return NextResponse.json({ error: "Only Super Admin can create teams" }, { status: 403 });
    }

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const dayOfWeek =
      typeof body.dayOfWeek === "number" && body.dayOfWeek >= 0 && body.dayOfWeek <= 6
        ? body.dayOfWeek
        : undefined;
    const isWrapUp = body.isWrapUp === true;

    const now = Date.now();
    const data: Record<string, unknown> = {
      name,
      leaderId: null,
      leader2Id: null,
      memberIds: [],
      isWrapUp: isWrapUp,
      createdAt: now,
      updatedAt: now,
    };
    if (dayOfWeek !== undefined) {
      data.dayOfWeek = dayOfWeek;
    }
    const ref = await db.collection("teams").add(data);
    return NextResponse.json({ id: ref.id, name });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
