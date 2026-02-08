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

    const [membersSnap2, teamsSnap, attendanceSnap, messagesSnap] = await Promise.all([
      db.collection("members").get(),
      db.collection("teams").get(),
      db.collection("attendance").orderBy("date", "desc").limit(100).get(),
      db.collection("messages").orderBy("sentAt", "desc").limit(10).get(),
    ]);

    let totalMembers = membersSnap2.size;
    let totalTeams = teamsSnap.size;
    let attendanceRate: number | null = null;
    const recentAttendance = attendanceSnap.docs.slice(0, 5).map((d) => {
      const x = d.data();
      return { id: d.id, teamId: x.teamId, date: x.date, submittedBy: x.submittedBy };
    });
    const recentMessages = messagesSnap.docs.map((d) => {
      const x = d.data();
      return { id: d.id, sentAt: x.sentAt, recipientCount: (x.recipientIds as string[]).length };
    });

    if (myRole === "admin") {
      const myTeamIds = Array.isArray(membersSnap.docs[0].data().teamIds) ? (membersSnap.docs[0].data().teamIds as string[]) : [];
      const leadTeamIds = teamsSnap.docs.filter((t) => t.data().leaderId === myId).map((t) => t.id);
      totalTeams = leadTeamIds.length;
      const myLeadMemberIds = new Set<string>();
      for (const tid of leadTeamIds) {
        const t = teamsSnap.docs.find((d) => d.id === tid);
        if (t) (t.data().memberIds as string[]).forEach((id) => myLeadMemberIds.add(id));
      }
      totalMembers = myLeadMemberIds.size;
    }

    const attendanceDocs = attendanceSnap.docs;
    if (attendanceDocs.length > 0) {
      let totalPresent = 0;
      let totalExpected = 0;
      for (const d of attendanceDocs) {
        const x = d.data();
        const present = (x.presentIds as string[]).length;
        const absent = (x.absentIds as string[]).length;
        totalPresent += present;
        totalExpected += present + absent;
      }
      attendanceRate = totalExpected > 0 ? Math.round((totalPresent / totalExpected) * 100) : null;
    }

    return NextResponse.json({
      totalMembers,
      totalTeams,
      attendanceRate,
      recentAttendance,
      recentMessages,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
