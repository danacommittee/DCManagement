import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { getSubscriptionsByUserIds, sendPushNotification, isPushConfigured } from "@/lib/push";

const WRAP_UP_MESSAGE_TEMPLATE = `Salaam {{Name}},

Per the weekly rotations, tonight, you are requested to stay back after your jaman to help with urpi thaal cleaning, Dana closing work in the kitchen. We anticipate it'll not take more than 1hr after mumineen jaman.

{{Team}} - 
Your fellow members for today: {{TeamMembers}}; 
Your leads for today: {{TeamLeaders}}

Shukran,
{{YourName}}`;

/**
 * Cron: run at 8 AM daily. Sends push reminders only to members of today's wrap-up team(s).
 * E.g. Saturday 8 AM → all members of the Saturday wrap-up team get the message.
 * Configure in Vercel: crons: [{ path: "/api/cron/attendance-reminder", schedule: "0 8 * * *" }]
 * Or call with Authorization: Bearer CRON_SECRET or x-vercel-cron-secret.
 * Optional env: PUSH_SENDER_NAME (default "Dana Committee - Houston") for {{YourName}}.
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
    const now = new Date();
    const todayDayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ... 6=Sat

    const [teamsSnap, membersSnap] = await Promise.all([
      db.collection("teams").get(),
      db.collection("members").get(),
    ]);

    const memberNameById = new Map<string, string>();
    membersSnap.docs.forEach((d) => {
      const x = d.data();
      const name =
        (x.name && String(x.name).trim()) ||
        [x.title, x.firstName, x.lastName].filter(Boolean).join(" ") ||
        x.email ||
        d.id;
      memberNameById.set(d.id, name);
    });

    // Only wrap-up teams whose dayOfWeek matches today
    const wrapUpTeams = teamsSnap.docs.filter((d) => {
      const t = d.data();
      return t.isWrapUp === true && t.dayOfWeek === todayDayOfWeek;
    });

    if (wrapUpTeams.length === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        message: `No wrap-up team for today (day ${todayDayOfWeek})`,
      });
    }

    const senderName = process.env.PUSH_SENDER_NAME || "Dana Committee - Houston";
    const userIds: string[] = [];
    const userToPayload: Map<string, { title: string; body: string; url: string }> = new Map();

    for (const teamDoc of wrapUpTeams) {
      const t = teamDoc.data();
      const teamId = teamDoc.id;
      const teamName = (t.name as string) || teamId;
      const memberIds: string[] = Array.isArray(t.memberIds) ? t.memberIds : [];
      const leaderId = t.leaderId ? String(t.leaderId) : null;
      const leader2Id = t.leader2Id ? String(t.leader2Id) : null;

      const leaderNames: string[] = [];
      if (leaderId) leaderNames.push(memberNameById.get(leaderId) || leaderId);
      if (leader2Id && leader2Id !== leaderId)
        leaderNames.push(memberNameById.get(leader2Id) || leader2Id);
      const teamLeadersStr = leaderNames.length > 0 ? leaderNames.join(", ") : "—";

      for (const memberId of memberIds) {
        const memberName = memberNameById.get(memberId) || memberId;
        const fellowMembers = memberIds
          .filter((id) => id !== memberId)
          .map((id) => memberNameById.get(id) || id);
        const teamMembersStr = fellowMembers.length > 0 ? fellowMembers.join(", ") : "—";

        const body = WRAP_UP_MESSAGE_TEMPLATE.replace(/\{\{Name\}\}/g, memberName)
          .replace(/\{\{Team\}\}/g, teamName)
          .replace(/\{\{TeamMembers\}\}/g, teamMembersStr)
          .replace(/\{\{TeamLeaders\}\}/g, teamLeadersStr)
          .replace(/\{\{YourName\}\}/g, senderName);

        userIds.push(memberId);
        userToPayload.set(memberId, {
          title: "Wrap-up reminder",
          body,
          url: "/dashboard/attendance",
        });
      }
    }

    const uniqueUserIds = [...new Set(userIds)];
    if (uniqueUserIds.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, message: "No members in today's wrap-up team(s)" });
    }

    const subscriptionsByUser = await getSubscriptionsByUserIds(uniqueUserIds);
    let sent = 0;
    for (const userId of uniqueUserIds) {
      const payload = userToPayload.get(userId);
      if (!payload) continue;
      const subs = subscriptionsByUser.get(userId) ?? [];
      for (const sub of subs) {
        const ok = await sendPushNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload
        );
        if (ok) sent++;
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      usersNotified: uniqueUserIds.length,
      wrapUpTeamsToday: wrapUpTeams.length,
    });
  } catch (e) {
    console.error("[attendance-reminder]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
