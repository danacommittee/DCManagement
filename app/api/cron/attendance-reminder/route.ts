import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { getSubscriptionsByUserIds, sendPushNotification, isPushConfigured } from "@/lib/push";
import { sendSmsGate, isSmsGateConfigured } from "@/lib/sms-gate";
import { toE164 } from "@/lib/phone";

const WRAP_UP_MESSAGE_TEMPLATE = `Salaam {{Name}},

Per the weekly rotations, tonight, you are requested to stay back after your jaman to help with urpi thaal cleaning, Dana closing work in the kitchen. We anticipate it'll not take more than 1hr after mumineen jaman.

{{Team}} - 
Your fellow members for today: {{TeamMembers}}; 
Your leads for today: {{TeamLeaders}}

Shukran,
{{YourName}}`;

/**
 * Cron: run at 8 AM daily. Sends SMS and/or push reminders to today's wrap-up team(s).
 * Order: team members first, then team leaders (per team).
 * E.g. Saturday 8 AM → members then leaders of the Saturday wrap-up team.
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

  if (!isPushConfigured() && !isSmsGateConfigured()) {
    return NextResponse.json({ error: "Neither push nor SMS configured" }, { status: 503 });
  }

  try {
    const now = new Date();
    const todayDayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ... 6=Sat

    const [teamsSnap, membersSnap] = await Promise.all([
      db.collection("teams").get(),
      db.collection("members").get(),
    ]);

    const memberNameById = new Map<string, string>();
    const memberPhoneById = new Map<string, string>();
    membersSnap.docs.forEach((d) => {
      const x = d.data();
      const name =
        (x.name && String(x.name).trim()) ||
        [x.title, x.firstName, x.lastName].filter(Boolean).join(" ") ||
        x.email ||
        d.id;
      memberNameById.set(d.id, name);
      if (x.phone && String(x.phone).trim()) memberPhoneById.set(d.id, String(x.phone).trim());
    });

    // Only wrap-up teams whose dayOfWeek matches today
    const wrapUpTeams = teamsSnap.docs.filter((d) => {
      const t = d.data();
      return t.isWrapUp === true && t.dayOfWeek === todayDayOfWeek;
    });

    if (wrapUpTeams.length === 0) {
      return NextResponse.json({
        ok: true,
        smsSent: 0,
        pushSent: 0,
        message: `No wrap-up team for today (day ${todayDayOfWeek})`,
      });
    }

    const senderName = process.env.PUSH_SENDER_NAME || "Dana Committee - Houston";
    // Order: members first, then leaders (per team); dedupe by order of first appearance
    const orderedUserIds: string[] = [];
    const seen = new Set<string>();
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

      // 1) Members first
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

        if (!seen.has(memberId)) {
          seen.add(memberId);
          orderedUserIds.push(memberId);
        }
        userToPayload.set(memberId, {
          title: "Wrap-up reminder",
          body,
          url: "/dashboard/attendance",
        });
      }

      // 2) Then leaders (same template, personalized)
      const leaderIds = [leaderId, leader2Id].filter((id): id is string => !!id && id.length > 0);
      for (const lid of leaderIds) {
        const leaderName = memberNameById.get(lid) || lid;
        const teamMembersStr = memberIds.length > 0
          ? memberIds.map((id) => memberNameById.get(id) || id).join(", ")
          : "—";
        const otherLeaders = leaderNames.filter((n) => n !== leaderName);
        const teamLeadersStrForLeader = otherLeaders.length > 0 ? otherLeaders.join(", ") : "—";

        const body = WRAP_UP_MESSAGE_TEMPLATE.replace(/\{\{Name\}\}/g, leaderName)
          .replace(/\{\{Team\}\}/g, teamName)
          .replace(/\{\{TeamMembers\}\}/g, teamMembersStr)
          .replace(/\{\{TeamLeaders\}\}/g, teamLeadersStrForLeader)
          .replace(/\{\{YourName\}\}/g, senderName);

        if (!seen.has(lid)) {
          seen.add(lid);
          orderedUserIds.push(lid);
        }
        userToPayload.set(lid, {
          title: "Wrap-up reminder",
          body,
          url: "/dashboard/attendance",
        });
      }
    }

    if (orderedUserIds.length === 0) {
      return NextResponse.json({ ok: true, smsSent: 0, pushSent: 0, message: "No members in today's wrap-up team(s)" });
    }

    let smsSent = 0;
    let pushSent = 0;

    // Send SMS first (members first, then leaders), if configured
    if (isSmsGateConfigured()) {
      for (const userId of orderedUserIds) {
        const payload = userToPayload.get(userId);
        const phone = memberPhoneById.get(userId);
        const e164 = phone ? toE164(phone) : null;
        if (!payload || !e164) continue;
        const result = await sendSmsGate({ message: payload.body, phoneNumbers: [e164] });
        if (result.ok) smsSent++;
      }
    }

    // Then send push (if enabled for user), same order
    if (isPushConfigured()) {
      const subscriptionsByUser = await getSubscriptionsByUserIds(orderedUserIds);
      for (const userId of orderedUserIds) {
        const payload = userToPayload.get(userId);
        if (!payload) continue;
        const subs = subscriptionsByUser.get(userId) ?? [];
        for (const sub of subs) {
          const res = await sendPushNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            payload
          );
          if (res.ok) {
            pushSent++;
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      smsSent,
      pushSent,
      usersNotified: orderedUserIds.length,
      wrapUpTeamsToday: wrapUpTeams.length,
    });
  } catch (e) {
    console.error("[attendance-reminder]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
