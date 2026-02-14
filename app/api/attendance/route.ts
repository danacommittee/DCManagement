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
    const eventId = searchParams.get("eventId");
    const teamId = searchParams.get("teamId");
    const date = searchParams.get("date");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const expandMembers = searchParams.get("expand") === "members";

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
        startTime: x.startTime,
        endTime: x.endTime,
        notes: x.notes,
        createdAt: x.createdAt,
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
    if (date) records = records.filter((r) => r.date === date);
    if (from) records = records.filter((r) => r.date >= from);
    if (to) records = records.filter((r) => r.date <= to);

    if (expandMembers && teamId) {
      const teamSnap = await db.collection("teams").doc(teamId).get();
      if (!teamSnap.exists) return NextResponse.json({ error: "Team not found" }, { status: 400 });
      if (myRole === "admin" && teamSnap.data()?.leaderId !== myId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // If this attendance request is for a specific event, use per-event overrides (if any).
      let memberIds = (teamSnap.data()?.memberIds as string[]) || [];
      if (eventId) {
        const eventSnap = await db.collection("events").doc(eventId).get();
        if (eventSnap.exists) {
          const ev = eventSnap.data()!;
          const override = (ev.teamOverrides as Record<string, { memberIds?: string[] }> | undefined)?.[teamId];
          if (Array.isArray(override?.memberIds)) {
            memberIds = override!.memberIds!;
          }
        }
      }

      const membersSnap2 = await db.collection("members").get();
      const membersMap = new Map<string, string>();
      membersSnap2.docs.forEach((d) => {
        const x = d.data();
        const name = [x.title, x.firstName, x.lastName].filter(Boolean).join(" ") || x.name || x.email || d.id;
        membersMap.set(d.id, name);
      });
      const members = memberIds.map((id) => ({ id, name: membersMap.get(id) || id }));
      const rec = records[0];
      const record = rec
        ? {
            presentIds: rec.presentIds,
            absentIds: rec.absentIds,
            startTime: rec.startTime,
            endTime: rec.endTime,
            notes: rec.notes,
          }
        : null;
      return NextResponse.json({ records, record, members });
    }

    return NextResponse.json({ records });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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
    const myRole = membersSnap.docs[0].data().role;

    const body = await req.json();
    const memberSelf = body.memberSelf === true;
    const eventId = typeof body.eventId === "string" ? body.eventId : null;
    const teamId = body.teamId;
    const date = body.date;
    let presentIds = Array.isArray(body.presentIds) ? body.presentIds : [];
    let absentIds = Array.isArray(body.absentIds) ? body.absentIds : [];
    const startTime = typeof body.startTime === "string" ? body.startTime.trim() : null;
    const endTime = typeof body.endTime === "string" ? body.endTime.trim() : null;
    const notes = typeof body.notes === "string" ? body.notes.trim() : null;
    const lat = typeof body.lat === "number" ? body.lat : null;
    const lng = typeof body.lng === "number" ? body.lng : null;

    if (!teamId || !date) return NextResponse.json({ error: "teamId and date required" }, { status: 400 });
    const today = new Date().toISOString().slice(0, 10);
    if (date > today) return NextResponse.json({ error: "Cannot submit attendance for future dates" }, { status: 403 });

    const teamSnap = await db.collection("teams").doc(teamId).get();
    if (!teamSnap.exists) return NextResponse.json({ error: "Team not found" }, { status: 400 });
    const teamData = teamSnap.data();
    let memberIds = (teamData?.memberIds as string[]) || [];

    if (memberSelf) {
      if (myRole !== "member") return NextResponse.json({ error: "memberSelf only for members" }, { status: 403 });
      if (date !== today) return NextResponse.json({ error: "Members can only mark attendance for today" }, { status: 403 });
      if (!memberIds.includes(myId)) return NextResponse.json({ error: "You are not in this team" }, { status: 403 });

      const venueLat = process.env.ATTENDANCE_VENUE_LAT ? parseFloat(process.env.ATTENDANCE_VENUE_LAT) : null;
      const venueLng = process.env.ATTENDANCE_VENUE_LNG ? parseFloat(process.env.ATTENDANCE_VENUE_LNG) : null;
      const venueRadius = process.env.ATTENDANCE_VENUE_RADIUS_METERS ? parseInt(process.env.ATTENDANCE_VENUE_RADIUS_METERS, 10) : null;
      if (venueLat != null && venueLng != null && venueRadius != null) {
        if (lat == null || lng == null) {
          return NextResponse.json({ error: "Location required. Please enable location access." }, { status: 400 });
        }
        const dist = distanceMeters(lat, lng, venueLat, venueLng);
        if (dist > venueRadius) {
          return NextResponse.json({ error: "You must be at the venue to mark attendance." }, { status: 403 });
        }
      }

      if (eventId) {
        const eventSnap = await db.collection("events").doc(eventId).get();
        if (!eventSnap.exists) return NextResponse.json({ error: "Event not found" }, { status: 400 });
        const ev = eventSnap.data()!;
        const teamIds = (ev.teamIds as string[]) || [];
        if (!teamIds.includes(teamId)) return NextResponse.json({ error: "Team not in this event" }, { status: 403 });
        const fromStr = (ev.dateFrom as string).slice(0, 10);
        const toStr = (ev.dateTo as string).slice(0, 10);
        if (date < fromStr || date > toStr) return NextResponse.json({ error: "Date not in event range" }, { status: 403 });

        // Apply per-event team overrides for membership (affects self-attendance + absent list).
        const override = (ev.teamOverrides as Record<string, { memberIds?: string[] }> | undefined)?.[teamId];
        if (Array.isArray(override?.memberIds)) {
          memberIds = override!.memberIds!;
        }
      }

      const existingQuery = db.collection("attendance").where("teamId", "==", teamId).where("date", "==", date);
      const existing = await existingQuery.limit(1).get();
      const now = Date.now();
      let newPresent: string[];
      let newAbsent: string[];
      if (!existing.empty) {
        const x = existing.docs[0].data();
        const present = Array.isArray(x.presentIds) ? x.presentIds : [];
        const absent = Array.isArray(x.absentIds) ? x.absentIds : [];
        newPresent = present.includes(myId) ? present : [...present.filter((id: string) => id !== myId), myId];
        newAbsent = absent.filter((id: string) => id !== myId);
      } else {
        newPresent = [myId];
        newAbsent = memberIds.filter((id) => id !== myId);
      }
      const docData = {
        ...(eventId ? { eventId } : {}),
        teamId,
        date,
        submittedBy: myId,
        presentIds: newPresent,
        absentIds: newAbsent,
        updatedAt: now,
      };
      if (!existing.empty) {
        await existing.docs[0].ref.update(docData);
        return NextResponse.json({ ok: true, id: existing.docs[0].id });
      }
      const ref = await db.collection("attendance").add({
        ...docData,
        createdAt: now,
      });
      return NextResponse.json({ ok: true, id: ref.id });
    }

    if (myRole === "super_admin") {
      // super_admin can submit for any team/date
    } else if (myRole === "admin" && teamData?.leaderId === myId) {
      // admin can submit for teams they lead
    } else {
      return NextResponse.json({ error: "Only team leader or super admin can submit full attendance" }, { status: 403 });
    }

    if (eventId) {
      const eventSnap = await db.collection("events").doc(eventId).get();
      if (!eventSnap.exists) return NextResponse.json({ error: "Event not found" }, { status: 400 });
      const ev = eventSnap.data()!;
      const teamIds = (ev.teamIds as string[]) || [];
      if (!teamIds.includes(teamId)) return NextResponse.json({ error: "Team not in this event" }, { status: 403 });
      const fromStr = (ev.dateFrom as string).slice(0, 10);
      const toStr = (ev.dateTo as string).slice(0, 10);
      if (date < fromStr || date > toStr) return NextResponse.json({ error: "Date not in event range" }, { status: 403 });
    }

    const existing = await db.collection("attendance").where("teamId", "==", teamId).where("date", "==", date).limit(1).get();
    const now = Date.now();
    const docData: Record<string, unknown> = {
      ...(eventId ? { eventId } : {}),
      presentIds,
      absentIds,
      submittedBy: myId,
      updatedAt: now,
    };
    if (startTime != null) docData.startTime = startTime;
    if (endTime != null) docData.endTime = endTime;
    if (notes != null) docData.notes = notes;
    if (!existing.empty) {
      await existing.docs[0].ref.update(docData);
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
      ...(eventId ? { eventId } : {}),
      ...(startTime != null ? { startTime } : {}),
      ...(endTime != null ? { endTime } : {}),
      ...(notes != null ? { notes } : {}),
    });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
