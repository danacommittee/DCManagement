import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { getSubscriptionsByUserIds, sendPushNotification, isPushConfigured } from "@/lib/push";

/**
 * Cron: run at 8 AM daily to send push reminders to users who are in a team scheduled for today.
 * Configure in Vercel: crons: [{ path: "/api/cron/attendance-reminder", schedule: "0 8 * * *" }]
 * Or call with Authorization: Bearer CRON_SECRET or x-vercel-cron-secret.
 */
export async function GET(req: NextRequest) {
  const vercelCronSecret = req.headers.get("x-vercel-cron-secret");
  const authHeader = req.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = vercelCronSecret === cronSecret;
  const isAuthorized = !cronSecret || authHeader === `Bearer ${cronSecret}` || isVercelCron;

  if (!isAuthorized && cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json({ error: "Push not configured" }, { status: 503 });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    const eventsSnap = await db.collection("events").get();
    const teamsSnap = await db.collection("teams").get();
    const teamNameById = new Map<string, string>();
    teamsSnap.docs.forEach((d) => {
      teamNameById.set(d.id, (d.data().name as string) || d.id);
    });

    const memberIdToTeamNames = new Map<string, string[]>();

    eventsSnap.docs.forEach((doc) => {
      const ev = doc.data();
      const dateFrom = (ev.dateFrom as string)?.slice(0, 10);
      const dateTo = (ev.dateTo as string)?.slice(0, 10);
      if (!dateFrom || !dateTo || today < dateFrom || today > dateTo) return;

      const teamIds = Array.isArray(ev.teamIds) ? ev.teamIds : [];
      const overrides = (ev.teamOverrides as Record<string, { memberIds?: string[] }>) ?? {};

      teamIds.forEach((teamId: string) => {
        const teamDoc = teamsSnap.docs.find((d) => d.id === teamId);
        const teamData = teamDoc?.data();
        let memberIds: string[] = Array.isArray(teamData?.memberIds) ? teamData!.memberIds : [];
        const override = overrides[teamId];
        if (override && Array.isArray(override.memberIds)) memberIds = override.memberIds;
        const teamName = teamNameById.get(teamId) ?? teamId;
        memberIds.forEach((mid) => {
          if (!memberIdToTeamNames.has(mid)) memberIdToTeamNames.set(mid, []);
          const list = memberIdToTeamNames.get(mid)!;
          if (!list.includes(teamName)) list.push(teamName);
        });
      });
    });

    const userIds = Array.from(memberIdToTeamNames.keys());
    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, message: "No members scheduled today" });
    }

    const subscriptionsByUser = await getSubscriptionsByUserIds(userIds);
    let sent = 0;
    for (const userId of userIds) {
      const teamNames = memberIdToTeamNames.get(userId) ?? [];
      if (teamNames.length === 0) continue;
      const subs = subscriptionsByUser.get(userId) ?? [];
      const title = "Attendance reminder";
      const body = `You're scheduled in ${teamNames.join(", ")} today – don't forget to mark your attendance.`;
      const url = "/dashboard/attendance";
      for (const sub of subs) {
        const ok = await sendPushNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          { title, body, url }
        );
        if (ok) sent++;
      }
    }

    return NextResponse.json({ ok: true, sent, usersWithTeams: userIds.length });
  } catch (e) {
    console.error("[attendance-reminder]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
