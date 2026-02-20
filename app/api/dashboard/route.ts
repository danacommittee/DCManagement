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

    const [membersSnap2, teamsSnap, attendanceSnap, messagesSnap, eventsSnap, templatesSnap] = await Promise.all([
      db.collection("members").get(),
      db.collection("teams").get(),
      db.collection("attendance").orderBy("date", "desc").limit(100).get(),
      db.collection("messages").orderBy("sentAt", "desc").limit(10).get(),
      db.collection("events").get(),
      db.collection("templates").get(),
    ]);

    const memberNameById = new Map<string, string>();
    membersSnap2.docs.forEach((doc) => {
      const d = doc.data();
      const name = (d.name as string) || [d.title, d.firstName, d.lastName].filter(Boolean).join(" ") || doc.id;
      memberNameById.set(doc.id, name);
    });
    const teamNameById = new Map<string, string>();
    teamsSnap.docs.forEach((doc) => {
      teamNameById.set(doc.id, (doc.data().name as string) || doc.id);
    });
    const eventNameById = new Map<string, string>();
    eventsSnap.docs.forEach((doc) => {
      eventNameById.set(doc.id, (doc.data().name as string) || doc.id);
    });
    const templateNameById = new Map<string, string>();
    templatesSnap.docs.forEach((doc) => {
      templateNameById.set(doc.id, (doc.data().name as string) || doc.id);
    });

    let totalMembers = membersSnap2.size;
    let totalTeams = teamsSnap.size;
    let attendanceRate: number | null = null;
    const recentAttendance = attendanceSnap.docs.slice(0, 5).map((d) => {
      const x = d.data();
      const teamId = x.teamId as string;
      const eventId = x.eventId as string | undefined;
      const presentIds = (x.presentIds as string[]) || [];
      const absentIds = (x.absentIds as string[]) || [];
      return {
        id: d.id,
        teamId,
        teamName: teamNameById.get(teamId) ?? "Team",
        date: x.date as string,
        submittedBy: x.submittedBy as string,
        submittedByName: memberNameById.get(x.submittedBy as string) ?? undefined,
        presentCount: presentIds.length,
        absentCount: absentIds.length,
        eventId: eventId || undefined,
        eventName: eventId ? eventNameById.get(eventId) : undefined,
      };
    });
    const recentMessages = messagesSnap.docs.map((d) => {
      const x = d.data();
      const templateId = x.templateId as string;
      const channels = (x.channels as string[]) || [];
      const createdBy = x.createdBy as string;
      return {
        id: d.id,
        sentAt: x.sentAt as number,
        recipientCount: (x.recipientIds as string[]).length,
        templateName: templateNameById.get(templateId) ?? "Message",
        channels,
        createdBy,
        createdByName: memberNameById.get(createdBy) ?? undefined,
      };
    });

    let leadTeamIds: string[] = [];
    if (myRole === "admin") {
      leadTeamIds = teamsSnap.docs
        .filter((t) => {
          const x = t.data();
          return x.leaderId === myId || x.leader2Id === myId;
        })
        .map((t) => t.id);
      totalTeams = leadTeamIds.length;
      const myLeadMemberIds = new Set<string>();
      for (const tid of leadTeamIds) {
        const t = teamsSnap.docs.find((d) => d.id === tid);
        if (t) (t.data().memberIds as string[]).forEach((id) => myLeadMemberIds.add(id));
      }
      totalMembers = myLeadMemberIds.size;
    }

    const today = new Date().toISOString().slice(0, 10);
    const submittedTeamIdsToday = new Set(
      attendanceSnap.docs.filter((d) => (d.data().date as string) === today).map((d) => d.data().teamId as string)
    );
    const teamsToRemind =
      myRole === "super_admin"
        ? teamsSnap.docs.map((t) => t.id).filter((tid) => !submittedTeamIdsToday.has(tid))
        : leadTeamIds.filter((tid) => !submittedTeamIdsToday.has(tid));
    const teamsWithoutAttendanceToday = teamsToRemind.length;

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
      teamsWithoutAttendanceToday,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
