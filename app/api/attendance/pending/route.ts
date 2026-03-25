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

    const meDoc = membersSnap.docs[0];
    const myId = meDoc.id;
    const meData = meDoc.data();
    const rawRole = meData.role;
    let myRole: "member" | "admin" | "super_admin";
    if (typeof rawRole === "string") {
      const normalized = rawRole.trim().toLowerCase().replace(/\s+/g, "_");
      if (normalized === "admin" || normalized === "super_admin") {
        myRole = normalized;
      } else {
        myRole = "member";
      }
    } else {
      myRole = "member";
    }

    const today = new Date().toISOString().slice(0, 10);

    const [eventsSnap, teamsSnap] = await Promise.all([
      db.collection("events").get(),
      db.collection("teams").get(),
    ]);

    type EventLite = {
      id: string;
      name: string;
      dateFrom: string;
      dateTo: string;
      teamIds: string[];
      teamOverrides?: Record<string, { memberIds?: string[] }>;
    };
    type TeamLite = {
      id: string;
      name: string;
      memberIds: string[];
      leaderId?: string;
      leader2Id?: string;
    };

    const events: EventLite[] = eventsSnap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        name: (x.name as string) || d.id,
        dateFrom: x.dateFrom as string,
        dateTo: x.dateTo as string,
        teamIds: Array.isArray(x.teamIds) ? (x.teamIds as string[]) : [],
        teamOverrides: x.teamOverrides as EventLite["teamOverrides"],
      };
    });

    const activeEvents = events.filter((e) => {
      const from = (e.dateFrom || "").slice(0, 10);
      const to = (e.dateTo || "").slice(0, 10);
      return from <= today && today <= to;
    });

    const teams: TeamLite[] = teamsSnap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        name: (x.name as string) || d.id,
        memberIds: Array.isArray(x.memberIds) ? (x.memberIds as string[]) : [],
        leaderId: x.leaderId as string | undefined,
        leader2Id: x.leader2Id as string | undefined,
      };
    });

    type AttendanceLite = {
      id: string;
      eventId: string | null;
      teamId: string;
      date: string;
      presentIds: string[];
      absentIds: string[];
    };

    const allEvents: EventLite[] = events;

    const earliestDateStr = allEvents.reduce<string | null>((acc, ev) => {
      const from = (ev.dateFrom || "").slice(0, 10);
      if (!from) return acc;
      if (!acc || from < acc) return from;
      return acc;
    }, null);

    const dateLowerBound = earliestDateStr ?? today;

    const attendanceSnap = await db
      .collection("attendance")
      .where("date", ">=", dateLowerBound)
      .where("date", "<=", today)
      .get();

    const attendance: AttendanceLite[] = attendanceSnap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        eventId: (x.eventId as string | undefined) ?? null,
        teamId: x.teamId as string,
        date: x.date as string,
        presentIds: (x.presentIds as string[]) || [],
        absentIds: (x.absentIds as string[]) || [],
      };
    });

    const hasMemberMarked = (eventId: string, teamId: string, date: string, memberId: string): boolean => {
      return attendance.some(
        (rec) =>
          rec.teamId === teamId &&
          rec.eventId === eventId &&
          rec.date === date &&
          (rec.presentIds.includes(memberId) || rec.absentIds.includes(memberId))
      );
    };

    const hasTeamAttendance = (eventId: string, teamId: string, date: string): boolean => {
      return attendance.some((rec) => rec.teamId === teamId && rec.eventId === eventId && rec.date === date);
    };

    const pendingSelfEvents: { eventId: string; eventName: string; dates: string[] }[] = [];
    const pendingTeams: { eventId: string; eventName: string; teamId: string; teamName: string; dates: string[] }[] =
      [];

    if (myRole === "member") {
      for (const ev of activeEvents) {
        const overrides = ev.teamOverrides ?? {};
        const relevantTeamIds = ev.teamIds.filter((tid) => {
          const override = overrides[tid];
          if (override && Array.isArray(override.memberIds)) {
            return override.memberIds.includes(myId);
          }
          const team = teams.find((t) => t.id === tid);
          return team ? team.memberIds.includes(myId) : false;
        });
        if (relevantTeamIds.length === 0) continue;

        const from = (ev.dateFrom || "").slice(0, 10);
        const to = (ev.dateTo || "").slice(0, 10);
        if (!from || !to) continue;

        const dates: string[] = [];
        let cursor = from;
        while (cursor <= today && cursor <= to) {
          let anyMarked = false;
          for (const tid of relevantTeamIds) {
            if (hasMemberMarked(ev.id, tid, cursor, myId)) {
              anyMarked = true;
              break;
            }
          }
          if (!anyMarked) {
            dates.push(cursor);
          }
          const d = new Date(cursor + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() + 1);
          cursor = d.toISOString().slice(0, 10);
        }

        if (dates.length > 0) {
          pendingSelfEvents.push({ eventId: ev.id, eventName: ev.name, dates });
        }
      }
    } else {
      const isSuper = myRole === "super_admin";
      const myTeamIds = isSuper
        ? teams.map((t) => t.id)
        : teams.filter((t) => t.leaderId === myId || t.leader2Id === myId).map((t) => t.id);

      for (const ev of activeEvents) {
        const from = (ev.dateFrom || "").slice(0, 10);
        const to = (ev.dateTo || "").slice(0, 10);
        if (!from || !to) continue;

        for (const tid of ev.teamIds) {
          if (!myTeamIds.includes(tid)) continue;
          const team = teams.find((t) => t.id === tid);
          const dates: string[] = [];

          let cursor = from;
          while (cursor <= today && cursor <= to) {
            if (!hasTeamAttendance(ev.id, tid, cursor)) {
              dates.push(cursor);
            }
            const d = new Date(cursor + "T00:00:00Z");
            d.setUTCDate(d.getUTCDate() + 1);
            cursor = d.toISOString().slice(0, 10);
          }

          if (dates.length > 0) {
            pendingTeams.push({
              eventId: ev.id,
              eventName: ev.name,
              teamId: tid,
              teamName: team?.name ?? tid,
              dates,
            });
          }
        }
      }
    }

    return NextResponse.json({
      role: myRole,
      today,
      pendingSelfEvents,
      pendingTeams,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

