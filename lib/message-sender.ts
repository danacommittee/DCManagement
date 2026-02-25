import { db } from "@/lib/firebase-admin";
import { getSubscriptionsByUserIds, sendPushNotification, isPushConfigured } from "@/lib/push";
import { sendEmail, isEmailConfigured } from "@/lib/nodemailer";
import { sendSmsGate, isSmsGateConfigured } from "@/lib/sms-gate";
import { toE164 } from "@/lib/phone";
import twilio from "twilio";
import type { EmailAttachment } from "@/lib/nodemailer";
import type { TemplateAttachment } from "@/types";
import admin from "firebase-admin";

function resolveBody(
  body: string,
  name: string,
  team: string,
  senderName: string,
  eventName: string,
  teamMembers: string,
  teamLeaders: string,
  inlineImageMap?: Record<string, string>,
  teamsList?: string
): string {
  let result = body
    .replace(/\{\{Name\}\}|\{\{name\}\}/g, name)
    .replace(/\{\{Team\}\}|\{\{team\}\}|\{\{TeamName\}\}/g, team)
    .replace(/\{\{YourName\}\}|\{\{your name\}\}/gi, senderName)
    .replace(/\{\{EventName\}\}|\{\{event name\}\}/gi, eventName)
    .replace(/\{\{TeamMembers\}\}|\{\{team members\}\}/gi, teamMembers)
    .replace(/\{\{TeamLeaders\}\}|\{\{team leaders\}\}/gi, teamLeaders)
    .replace(/\{\{TeamsList\}\}|\{\{teams list\}\}|\{\{AllTeamsWithMembers\}\}/gi, teamsList ?? "");
  
  // Replace inline image placeholders: {{InlineImage:key}} -> <img src="cid:key" />
  if (inlineImageMap) {
    for (const [key, cid] of Object.entries(inlineImageMap)) {
      const placeholder = new RegExp(`\\{\\{InlineImage:${key}\\}\\}`, "gi");
      result = result.replace(placeholder, `<img src="cid:${cid}" alt="" />`);
    }
  }
  
  return result;
}

async function prepareAttachments(
  attachments: TemplateAttachment[]
): Promise<{ attachments: EmailAttachment[]; inlineImageMap: Record<string, string> }> {
  const emailAttachments: EmailAttachment[] = [];
  const inlineImageMap: Record<string, string> = {};
  const storage = admin.storage();

  for (const att of attachments) {
    try {
      const url = new URL(att.url);
      let storagePath: string;
      
      if (url.hostname === "storage.googleapis.com") {
        storagePath = url.pathname.substring(1);
      } else if (url.hostname === "firebasestorage.googleapis.com") {
        const pathMatch = url.pathname.match(/\/o\/(.+)$/);
        if (!pathMatch) {
          console.warn(`[Attachments] Could not parse Firebase Storage path from URL: ${att.url}`);
          continue;
        }
        storagePath = decodeURIComponent(pathMatch[1]);
      } else {
        console.warn(`[Attachments] Unsupported storage URL format: ${att.url}`);
        continue;
      }
      
      let bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
      if (bucketName && bucketName.includes(".firebasestorage.app")) {
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
        if (projectId) {
          bucketName = `${projectId}.appspot.com`;
        }
      }
      if (!bucketName) {
        console.warn(`[Attachments] Storage bucket not configured`);
        continue;
      }
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(storagePath);
      const [buffer] = await file.download();

      if (att.inline && att.cidKey) {
        emailAttachments.push({
          filename: att.name,
          contentType: att.contentType,
          content: buffer,
          cid: att.cidKey,
        });
        inlineImageMap[att.cidKey] = att.cidKey;
      } else {
        emailAttachments.push({
          filename: att.name,
          contentType: att.contentType,
          content: buffer,
        });
      }
    } catch (err) {
      console.error(`[Attachments] Failed to download ${att.name} from ${att.url}:`, err);
    }
  }

  return { attachments: emailAttachments, inlineImageMap };
}

export interface SendMessageParams {
  templateId: string;
  eventId?: string | null;
  audienceType: "individual" | "sub_team" | "entire_team";
  audienceId?: string;
  /** For individual: optional array of member IDs (multiple recipients). */
  audienceIds?: string[];
  channels: ("email" | "sms" | "whatsapp" | "push")[];
  senderId: string;
  senderName: string;
  /** If set, use this body instead of the template body (e.g. edited preview). */
  bodyOverride?: string;
  /** If set, use as email subject (email only; SMS/WhatsApp unchanged). */
  subjectOverride?: string;
}

/** Per-channel result for one recipient */
export interface ChannelResult {
  channel: "email" | "sms" | "whatsapp" | "push";
  ok: boolean;
  error?: string;
}

/** Per-recipient send result (all channels attempted for this recipient) */
export interface RecipientSendResult {
  recipientId: string;
  recipientName: string;
  channels: ChannelResult[];
}

export interface SendMessageResult {
  ok: boolean;
  sent: number;
  failed: number;
  recipientCount: number;
  recipientIds?: string[];
  message?: string;
  error?: string;
  /** Per-recipient, per-channel results for scheduled run details */
  details?: RecipientSendResult[];
}

export async function sendMessages(params: SendMessageParams): Promise<SendMessageResult> {
  const { templateId, eventId, audienceType, audienceId, audienceIds, channels, senderId, senderName, bodyOverride, subjectOverride } = params;

  // Get template
  const templateSnap = await db.collection("templates").doc(templateId).get();
  if (!templateSnap.exists) {
    return { ok: false, sent: 0, failed: 0, recipientCount: 0, error: "Template not found" };
  }
  const templateData = templateSnap.data();
  const templateBody = (bodyOverride != null && bodyOverride !== "") ? bodyOverride : ((templateData?.body as string) || "");
  const templateName = (templateData?.name as string) || "Message";
  const emailSubject = (subjectOverride != null && subjectOverride.trim() !== "") ? subjectOverride.trim() : templateName;
  const templateAttachments = (templateData?.attachments as TemplateAttachment[] | undefined) || [];

  // Get recipients and team context (all teams per member so one message can list every team they're in)
  let recipientIds: string[] = [];
  let eventName = "";
  const memberEventTeams: Record<string, string[]> = {};
  const teamMeta: Record<string, { name: string; memberIds: string[]; leaderIds: string[] }> = {};

  if (audienceType === "entire_team") {
    const teamsSnap = await db.collection("teams").get();
    const teamsMap = new Map<string, { name: string; memberIds: string[]; leaderIds: string[] }>();
    teamsSnap.docs.forEach((d) => {
      const x = d.data();
      teamsMap.set(d.id, {
        name: (x.name as string) || d.id,
        memberIds: Array.isArray(x.memberIds) ? (x.memberIds as string[]) : [],
        leaderIds: [
          ...(x.leaderId ? [String(x.leaderId)] : []),
          ...(x.leader2Id ? [String(x.leader2Id)] : []),
        ],
      });
    });

    if (eventId) {
      const eventSnap = await db.collection("events").doc(eventId).get();
      if (!eventSnap.exists) {
        return { ok: false, sent: 0, failed: 0, recipientCount: 0, error: "Event not found" };
      }
      const ev = eventSnap.data()!;
      eventName = typeof ev.name === "string" ? ev.name : "";
      const teamIds = (ev.teamIds as string[]) || [];
      const overrides = (ev.teamOverrides as Record<string, { memberIds?: string[] }> | undefined) ?? {};
      const idSet = new Set<string>();
      for (const tid of teamIds) {
        const base = teamsMap.get(tid);
        if (!base) continue;
        const override = overrides[tid];
        const effectiveMembers = Array.isArray(override?.memberIds) ? override!.memberIds! : base.memberIds;
        teamMeta[tid] = {
          name: base.name,
          memberIds: effectiveMembers,
          leaderIds: base.leaderIds,
        };
        for (const mid of effectiveMembers) {
          idSet.add(mid);
          if (!memberEventTeams[mid]) memberEventTeams[mid] = [];
          if (!memberEventTeams[mid].includes(tid)) memberEventTeams[mid].push(tid);
        }
        for (const lid of base.leaderIds) {
          idSet.add(lid);
          if (!memberEventTeams[lid]) memberEventTeams[lid] = [];
          if (!memberEventTeams[lid].includes(tid)) memberEventTeams[lid].push(tid);
        }
      }
      recipientIds = Array.from(idSet);
    } else {
      const membersSnap2 = await db.collection("members").get();
      recipientIds = membersSnap2.docs.map((d) => d.id);
      for (const d of teamsSnap.docs) {
        const tid = d.id;
        const base = teamsMap.get(tid)!;
        teamMeta[tid] = { name: base.name, memberIds: base.memberIds, leaderIds: base.leaderIds };
      }
      for (const memberId of recipientIds) {
        const doc = membersSnap2.docs.find((x) => x.id === memberId);
        const teamIds = Array.isArray(doc?.data()?.teamIds) ? (doc!.data()!.teamIds as string[]) : [];
        const validTeamIds = teamIds.filter((tid) => teamsMap.has(tid));
        if (validTeamIds.length > 0) memberEventTeams[memberId] = validTeamIds;
      }
    }
  } else if (audienceType === "sub_team" && audienceId) {
    const teamSnap = await db.collection("teams").doc(audienceId).get();
    if (!teamSnap.exists) {
      return { ok: false, sent: 0, failed: 0, recipientCount: 0, error: "Team not found" };
    }
    const team = teamSnap.data()!;
    const baseMemberIds = Array.isArray(team.memberIds) ? (team.memberIds as string[]) : [];
    const leaderIds = [
      ...(team.leaderId ? [String(team.leaderId)] : []),
      ...(team.leader2Id ? [String(team.leader2Id)] : []),
    ];
    let effectiveMembers = baseMemberIds;
    if (eventId) {
      const eventSnap = await db.collection("events").doc(eventId).get();
      if (eventSnap.exists) {
        const ev = eventSnap.data()!;
        eventName = typeof ev.name === "string" ? ev.name : "";
        const override = (ev.teamOverrides as Record<string, { memberIds?: string[] }> | undefined)?.[audienceId];
        if (Array.isArray(override?.memberIds)) {
          effectiveMembers = override!.memberIds!;
        }
      }
    }
    const recipientSet = new Set<string>(effectiveMembers);
    for (const lid of leaderIds) recipientSet.add(lid);
    recipientIds = Array.from(recipientSet);
    teamMeta[audienceId] = {
      name: (team.name as string) || audienceId,
      memberIds: effectiveMembers,
      leaderIds,
    };
    for (const mid of recipientSet) {
      memberEventTeams[mid] = [audienceId];
    }
  } else if (audienceType === "individual") {
    if (Array.isArray(params.audienceIds) && params.audienceIds.length > 0) {
      recipientIds = params.audienceIds;
    } else if (params.audienceId) {
      recipientIds = [params.audienceId];
    }
  }

  if (recipientIds.length === 0) {
    return { ok: false, sent: 0, failed: 0, recipientCount: 0, error: "No recipients found" };
  }

  // Get members data
  const membersSnap2 = await db.collection("members").get();
  const membersMap: Record<string, { name: string; phone: string; email: string; teamIds: string[]; notifyPush: boolean }> = {};
  membersSnap2.docs.forEach((d) => {
    const x = d.data();
    const name = (x.name != null && String(x.name).trim()) ? String(x.name).trim() : [x.title, x.firstName, x.lastName].filter(Boolean).join(" ") || x.email || "";
    membersMap[d.id] = {
      name,
      phone: (x.phone as string) || "",
      email: (x.email as string) || "",
      teamIds: Array.isArray(x.teamIds) ? (x.teamIds as string[]) : [],
      notifyPush: x.notifyPush != null ? !!x.notifyPush : true,
    };
  });

  // Get teams for context
  const teamsSnap = await db.collection("teams").get();
  const teamsMap: Record<string, string> = {};
  teamsSnap.docs.forEach((d) => {
    teamsMap[d.id] = (d.data().name as string) || d.id;
  });

  let totalSent = 0;
  let totalFailed = 0;
  const summaryParts: string[] = [];

  const getContextForMember = (memberId: string) => {
    const member = membersMap[memberId];
    if (!member) {
      return {
        member,
        teamName: "",
        teamMembersList: "",
        teamLeadersList: "",
        teamsListFormatted: "",
      };
    }
    const teamIds = memberEventTeams[memberId];
    if (teamIds?.length > 0 && Object.keys(teamMeta).length > 0) {
      const parts: string[] = [];
      let firstTeamName = "";
      let firstTeamMembersList = "";
      let firstTeamLeadersList = "";
      for (const tid of teamIds) {
        const meta = teamMeta[tid];
        if (!meta) continue;
        const teamMembersList = meta.memberIds
          .map((mid) => (membersMap[mid]?.name != null ? membersMap[mid].name : mid))
          .join(", ");
        const teamLeadersList = meta.leaderIds
          .map((lid) => (membersMap[lid]?.name != null ? membersMap[lid].name : lid))
          .filter(Boolean)
          .join(", ");
        const leaderLine = teamLeadersList ? `\nLeads: ${teamLeadersList}` : "";
        parts.push(`${meta.name}: ${teamMembersList}${leaderLine}`);
        if (!firstTeamName) {
          firstTeamName = meta.name;
          firstTeamMembersList = teamMembersList;
          firstTeamLeadersList = teamLeadersList;
        }
      }
      const teamsListFormatted = parts.join("\n\n");
      return {
        member,
        teamName: teamIds.length > 1 ? teamIds.map((tid) => teamMeta[tid]?.name ?? tid).join(", ") : firstTeamName,
        teamMembersList: firstTeamMembersList,
        teamLeadersList: firstTeamLeadersList,
        teamsListFormatted,
      };
    }
    const fallbackTeamName =
      member.teamIds.length > 0 && teamsMap[member.teamIds[0]] != null ? teamsMap[member.teamIds[0]] : "";
    return {
      member,
      teamName: fallbackTeamName,
      teamMembersList: "",
      teamLeadersList: "",
      teamsListFormatted: "",
    };
  };

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const pushEnabled = isPushConfigured();

  // Preload push subscriptions once if push is requested
  const pushSubscriptionsByUser = channels.includes("push") && pushEnabled
    ? await getSubscriptionsByUserIds(recipientIds)
    : new Map<string, { userId: string; endpoint: string; keys: { p256dh: string; auth: string } }[]>();

  // Per-recipient, per-channel results for details (e.g. scheduled run breakdown)
  const detailsByRecipient = new Map<string, { recipientName: string; channels: ChannelResult[] }>();
  for (const memberId of recipientIds) {
    const m = membersMap[memberId];
    detailsByRecipient.set(memberId, {
      recipientName: m?.name ?? memberId,
      channels: [],
    });
  }

  const addChannelResult = (memberId: string, channel: "email" | "sms" | "whatsapp" | "push", ok: boolean, error?: string) => {
    const entry = detailsByRecipient.get(memberId);
    if (entry) entry.channels.push({ channel, ok, error: error ?? undefined });
  };

  for (const channel of channels) {
    let sent = 0;
    let failed = 0;

    if (channel === "email" && isEmailConfigured()) {
      let lastError: string | null = null;
      // Prepare attachments once for all recipients (if any)
      let emailAttachments: EmailAttachment[] = [];
      let inlineImageMap: Record<string, string> = {};
      if (templateAttachments.length > 0) {
        try {
          const prepared = await prepareAttachments(templateAttachments);
          emailAttachments = prepared.attachments;
          inlineImageMap = prepared.inlineImageMap;
        } catch (err) {
          console.error("[Email] Failed to prepare attachments:", err);
        }
      }

      for (const memberId of recipientIds) {
        const { member, teamName, teamMembersList, teamLeadersList, teamsListFormatted } = getContextForMember(memberId);
        if (!member || !member.email) {
          addChannelResult(memberId, "email", false, "No email address");
          failed++;
          continue;
        }

        const text = resolveBody(
          templateBody,
          member.name,
          teamName,
          senderName,
          eventName,
          teamMembersList,
          teamLeadersList,
          inlineImageMap,
          teamsListFormatted
        );
        const html = text.replace(/\n/g, "<br>");

        const result = await sendEmail({
          to: member.email,
          subject: emailSubject,
          text,
          html,
          attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
        });
        if (result.ok) {
          sent++;
          addChannelResult(memberId, "email", true);
        } else {
          console.error("Email send failed for", memberId, result.error);
          if (result.error && !lastError) lastError = String(result.error);
          addChannelResult(memberId, "email", false, result.error ?? "Send failed");
          failed++;
        }
      }
      totalSent += sent;
      totalFailed += failed;
      const attachmentNote =
        emailAttachments.length > 0
          ? ` (${emailAttachments.length} attachment${emailAttachments.length === 1 ? "" : "s"})`
          : "";
      summaryParts.push(
        "Email: " +
          sent +
          " sent" +
          (failed > 0 ? ", " + failed + " failed" : "") +
          attachmentNote +
          (lastError ? " (e.g. " + lastError + ")" : "")
      );
    } else if (channel === "sms" && (isSmsGateConfigured() || (sid && authToken && fromNumber))) {
      let lastError: string | null = null;
      for (const memberId of recipientIds) {
        const { member, teamName, teamMembersList, teamLeadersList, teamsListFormatted } = getContextForMember(memberId);
        const e164 = member ? toE164(member.phone) : null;
        if (!member || !e164) {
          const err = member ? "Phone invalid (missing or incorrect format)." : "Member not found.";
          lastError = err;
          addChannelResult(memberId, "sms", false, err);
          failed++;
          continue;
        }
        const text = resolveBody(
          templateBody,
          member.name,
          teamName,
          senderName,
          eventName,
          teamMembersList,
          teamLeadersList,
          undefined,
          teamsListFormatted
        );

        if (isSmsGateConfigured()) {
          const result = await sendSmsGate({ message: text, phoneNumbers: [e164] });
          if (result.ok) {
            sent++;
            addChannelResult(memberId, "sms", true);
            if (result.messageId) {
              console.log(`[SMS Gate] Scheduled message sent to ${e164}, messageId: ${result.messageId}`);
            }
          } else {
            console.error("SMS Gate send failed for", memberId, result.error);
            if (result.error) lastError = String(result.error);
            addChannelResult(memberId, "sms", false, result.error ?? "Send failed");
            failed++;
          }
        } else if (sid && authToken && fromNumber) {
          const client = twilio(sid, authToken);
          try {
            await client.messages.create({ body: text, from: fromNumber, to: e164 });
            sent++;
            addChannelResult(memberId, "sms", true);
          } catch (err) {
            console.error("Twilio SMS send failed for", memberId, err);
            const errMsg = err instanceof Error ? err.message : String(err);
            if (!lastError) lastError = errMsg;
            addChannelResult(memberId, "sms", false, errMsg);
            failed++;
          }
        }
      }
      totalSent += sent;
      totalFailed += failed;
      summaryParts.push(
        "SMS: " +
          sent +
          " sent" +
          (failed > 0 ? ", " + failed + " failed" : "") +
          (lastError ? " (e.g. " + lastError + ")" : "")
      );
    } else if (channel === "whatsapp" && sid && authToken && fromNumber) {
      let lastError: string | null = null;
      for (const memberId of recipientIds) {
        const { member, teamName, teamMembersList, teamLeadersList, teamsListFormatted } = getContextForMember(memberId);
        const e164 = member ? toE164(member.phone) : null;
        if (!member || !e164) {
          addChannelResult(memberId, "whatsapp", false, !member ? "Member not found." : "Phone invalid or missing.");
          failed++;
          continue;
        }
        const text = resolveBody(
          templateBody,
          member.name,
          teamName,
          senderName,
          eventName,
          teamMembersList,
          teamLeadersList,
          undefined,
          teamsListFormatted
        );
        const client = twilio(sid, authToken);
        try {
          await client.messages.create({ body: text, from: `whatsapp:${fromNumber}`, to: `whatsapp:${e164}` });
          sent++;
          addChannelResult(memberId, "whatsapp", true);
        } catch (err) {
          console.error("Twilio WhatsApp send failed for", memberId, err);
          const errMsg = err instanceof Error ? err.message : String(err);
          if (!lastError) lastError = errMsg;
          addChannelResult(memberId, "whatsapp", false, errMsg);
          failed++;
        }
      }
      totalSent += sent;
      totalFailed += failed;
      summaryParts.push(
        "WhatsApp: " +
          sent +
          " sent" +
          (failed > 0 ? ", " + failed + " failed" : "") +
          (lastError ? " (e.g. " + lastError + ")" : "")
      );
    } else if (channel === "push" && pushEnabled) {
      let lastError: string | null = null;
      for (const memberId of recipientIds) {
        const subs = pushSubscriptionsByUser.get(memberId) ?? [];
        const { member, teamName, teamMembersList, teamLeadersList, teamsListFormatted } = getContextForMember(memberId);
        const meta = membersMap[memberId];
        if (!member) {
          if (!lastError) lastError = "Member not found.";
          addChannelResult(memberId, "push", false, "Member not found.");
          failed++;
          continue;
        }
        if (meta && meta.notifyPush === false) {
          if (!lastError) lastError = "Push is disabled in settings for this user.";
          addChannelResult(memberId, "push", false, "Push is disabled in settings.");
          failed++;
          continue;
        }
        if (subs.length === 0) {
          if (!lastError) lastError = "No push subscription found for this user (device not enabled).";
          addChannelResult(memberId, "push", false, "No push subscription (device not enabled).");
          failed++;
          continue;
        }
        const text = resolveBody(
          templateBody,
          member.name,
          teamName,
          senderName,
          eventName,
          teamMembersList,
          teamLeadersList,
          undefined,
          teamsListFormatted
        );
        let userSent = false;
        let pushError: string | undefined;
        for (const sub of subs) {
          const res = await sendPushNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            { title: templateName, body: text, url: "/dashboard" }
          );
          if (res.ok) {
            sent++;
            userSent = true;
          } else {
            if (res.error && !lastError) lastError = res.error;
            pushError = res.error;
          }
        }
        addChannelResult(memberId, "push", userSent, userSent ? undefined : (pushError ?? "Send failed"));
        if (!userSent) failed++;
      }
      totalSent += sent;
      totalFailed += failed;
      summaryParts.push(
        "Push: " +
          sent +
          " sent" +
          (failed > 0 ? ", " + failed + " failed" : "") +
          (lastError ? " (e.g. " + lastError + ")" : "")
      );
    }
  }

  const message = summaryParts.length > 0 ? summaryParts.join("; ") : "No messages sent";
  const allFailed = totalSent === 0 && totalFailed > 0;
  const details: RecipientSendResult[] = Array.from(detailsByRecipient.entries()).map(([recipientId, { recipientName, channels }]) => ({
    recipientId,
    recipientName,
    channels,
  }));

  return {
    ok: !allFailed,
    sent: totalSent,
    failed: totalFailed,
    recipientCount: recipientIds.length,
    recipientIds,
    message,
    error: allFailed ? message : undefined,
    details,
  };
}
