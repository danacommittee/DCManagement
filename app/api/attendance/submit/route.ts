import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = body.token;
    const teamId = body.teamId;
    const presentIds = Array.isArray(body.presentIds) ? body.presentIds : [];
    const absentIds = Array.isArray(body.absentIds) ? body.absentIds : [];
    const date = body.date || new Date().toISOString().slice(0, 10);

    if (!token || !teamId) {
      return NextResponse.json({ error: "token and teamId required" }, { status: 400 });
    }

    const linksSnap = await db.collection("attendance_links").where("secret", "==", token).limit(5).get();
    const linkDoc = linksSnap.docs.find((d) => d.data().teamId === teamId);
    if (!linkDoc) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
    }
    const link = linkDoc.data();
    if (link.expiresAt < Date.now()) {
      return NextResponse.json({ error: "Link has expired" }, { status: 403 });
    }

    const teamSnap = await db.collection("teams").doc(teamId).get();
    if (!teamSnap.exists) return NextResponse.json({ error: "Team not found" }, { status: 400 });

    const existing = await db.collection("attendance").where("teamId", "==", teamId).where("date", "==", date).limit(1).get();
    const now = Date.now();
    if (!existing.empty) {
      await existing.docs[0].ref.update({
        presentIds,
        absentIds,
        submittedBy: "link",
        updatedAt: now,
      });
      return NextResponse.json({ ok: true, id: existing.docs[0].id });
    }
    const ref = await db.collection("attendance").add({
      teamId,
      date,
      submittedBy: "link",
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const teamId = searchParams.get("teamId");
  if (!token || !teamId) {
    return NextResponse.json({ error: "token and teamId required" }, { status: 400 });
  }
  try {
    const linksSnap = await db.collection("attendance_links").where("secret", "==", token).limit(5).get();
    const linkDoc = linksSnap.docs.find((d) => d.data().teamId === teamId);
    if (!linkDoc) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
    }
    const link = linkDoc.data();
    if (link.expiresAt < Date.now()) {
      return NextResponse.json({ error: "Link has expired" }, { status: 403 });
    }
    const teamSnap = await db.collection("teams").doc(teamId).get();
    if (!teamSnap.exists) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    const team = teamSnap.data();
    const memberIds = Array.isArray(team?.memberIds) ? (team.memberIds as string[]) : [];
    const membersSnap = await db.collection("members").get();
    const membersMap = Object.fromEntries(
      membersSnap.docs.map((d) => {
        const x = d.data();
        const computedName = [x.title, x.firstName, x.lastName].filter(Boolean).join(" ") || x.email || d.id;
        const name = x.name != null ? x.name : computedName;
        return [d.id, { id: d.id, name, email: x.email }];
      })
    );
    const members = memberIds.map((id) => membersMap[id]).filter(Boolean);
    return NextResponse.json({ teamName: team?.name, members, date: new Date().toISOString().slice(0, 10) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
