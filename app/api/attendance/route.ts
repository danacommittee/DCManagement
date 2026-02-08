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
    const myRole = membersSnap.docs[0].data().role;
    const myId = membersSnap.docs[0].id;

    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const snap = await db.collection("attendance").orderBy("date", "desc").limit(500).get();
    let records = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        teamId: x.teamId,
        date: x.date,
        submittedBy: x.submittedBy,
        presentIds: Array.isArray(x.presentIds) ? x.presentIds : [],
        absentIds: Array.isArray(x.absentIds) ? x.absentIds : [],
        createdAt: x.createdAt,
      };
    });
    if (teamId) {
      const teamSnap = await db.collection("teams").doc(teamId).get();
      if (!teamSnap.exists) return NextResponse.json({ error: "Team not found" }, { status: 400 });
      if (myRole === "admin" && teamSnap.data()?.leaderId !== myId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      records = records.filter((r) => r.teamId === teamId);
    }
    if (from) records = records.filter((r) => r.date >= from);
    if (to) records = records.filter((r) => r.date <= to);
    return NextResponse.json({ records });
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
    const myId = membersSnap.docs[0].id;

    const body = await req.json();
    const teamId = body.teamId;
    const date = body.date;
    const presentIds = Array.isArray(body.presentIds) ? body.presentIds : [];
    const absentIds = Array.isArray(body.absentIds) ? body.absentIds : [];

    if (!teamId || !date) return NextResponse.json({ error: "teamId and date required" }, { status: 400 });

    const teamSnap = await db.collection("teams").doc(teamId).get();
    if (!teamSnap.exists) return NextResponse.json({ error: "Team not found" }, { status: 400 });
    if (teamSnap.data()?.leaderId !== myId) {
      return NextResponse.json({ error: "Only the team leader can submit attendance" }, { status: 403 });
    }

    const existing = await db.collection("attendance").where("teamId", "==", teamId).where("date", "==", date).limit(1).get();
    const now = Date.now();
    if (!existing.empty) {
      await existing.docs[0].ref.update({
        presentIds,
        absentIds,
        submittedBy: myId,
        updatedAt: now,
      });
      return NextResponse.json({ ok: true, id: existing.docs[0].id });
    }
    const ref = await db.collection("attendance").add({
      teamId,
      date,
      submittedBy: myId,
      presentIds,
      absentIds,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
