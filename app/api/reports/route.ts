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
    if (myRole !== "super_admin" && myRole !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "json";
    const eventId = searchParams.get("eventId");
    const teamId = searchParams.get("teamId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const snap = await db.collection("attendance").orderBy("date", "desc").limit(500).get();
    let records = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        eventId: x.eventId,
        teamId: x.teamId,
        date: x.date,
        submittedBy: x.submittedBy,
        presentIds: Array.isArray(x.presentIds) ? x.presentIds : [],
        absentIds: Array.isArray(x.absentIds) ? x.absentIds : [],
      };
    });
    if (eventId) records = records.filter((r) => r.eventId === eventId);
    if (myRole === "admin") {
      const teamsSnap = await db.collection("teams").get();
      const leaderTeamIds = new Set(teamsSnap.docs.filter((d) => d.data().leaderId === myId).map((d) => d.id));
      records = records.filter((r) => leaderTeamIds.has(r.teamId));
    }
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

    const teamIds = [...new Set(records.map((r) => r.teamId))];
    const teamsSnap = await db.collection("teams").get();
    const teamsMap = Object.fromEntries(teamsSnap.docs.map((d) => [d.id, d.data().name]));
    const memberIds = [...new Set(records.flatMap((r) => [...r.presentIds, ...r.absentIds]))];
    const membersSnap2 = await db.collection("members").get();
    const membersMap = Object.fromEntries(
      membersSnap2.docs.map((d) => {
        const x = d.data();
        const computedName = [x.title, x.firstName, x.lastName].filter(Boolean).join(" ") || x.email || d.id;
        const name = x.name != null ? x.name : computedName;
        return [d.id, name];
      })
    );

    const report = records.map((r) => ({
      date: r.date,
      team: teamsMap[r.teamId] != null ? teamsMap[r.teamId] : r.teamId,
      presentCount: r.presentIds.length,
      absentCount: r.absentIds.length,
      present: r.presentIds.map((id: string) => (membersMap[id] != null ? membersMap[id] : id)),
      absent: r.absentIds.map((id: string) => (membersMap[id] != null ? membersMap[id] : id)),
    }));

    if (format === "csv") {
      const header = "Date,Team,Present Count,Absent Count,Present Names,Absent Names\n";
      const rows = report.map(
        (r) =>
          `${r.date},${(r.team as string).replace(/,/g, ";")},${r.presentCount},${r.absentCount},"${(r.present as string[]).join("; ")}","${(r.absent as string[]).join("; ")}"`
      ).join("\n");
      return new NextResponse(header + rows, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": "attachment; filename=attendance-report.csv",
        },
      });
    }

    return NextResponse.json({ report, records: report.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
