import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";
import twilio from "twilio";
import { sendEmail, isEmailConfigured } from "@/lib/nodemailer";
import { sendSmsGate, isSmsGateConfigured } from "@/lib/sms-gate";
import { toE164 } from "@/lib/phone";

function resolveBody(body: string, name: string, team: string): string {
  return body
    .replace(/\{\{Name\}\}/g, name)
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{Team\}\}/g, team)
    .replace(/\{\{team\}\}/g, team);
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
    const role = membersSnap.docs[0].data().role;
    const myId = membersSnap.docs[0].id;
    if (role !== "super_admin" && role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const templateId = body.templateId;
    const eventId = typeof body.eventId === "string" ? body.eventId.trim() : null;
    const audienceType = body.audienceType;
    const audienceId = body.audienceId;
    const rawChannels = Array.isArray(body.channels) ? body.channels : (typeof body.channel === "string" ? [body.channel] : []);
    const channels = rawChannels.filter((c): c is "email" | "sms" | "whatsapp" => ["email", "sms", "whatsapp"].includes(c));

    if (!templateId || !["individual", "sub_team", "entire_team"].includes(audienceType)) {
      return NextResponse.json({ error: "Invalid templateId or audienceType" }, { status: 400 });
    }
    if (channels.length === 0) {
      return NextResponse.json({ error: "Select at least one channel (email, sms, or whatsapp)" }, { status: 400 });
    }

    let recipientIds: string[] = [];
    if (audienceType === "entire_team") {
      const membersSnap2 = await db.collection("members").get();
      recipientIds = membersSnap2.docs.map((d) => d.id);
    } else if (audienceType === "sub_team" && audienceId) {
      const teamSnap = await db.collection("teams").doc(audienceId).get();
      if (!teamSnap.exists) return NextResponse.json({ error: "Team not found" }, { status: 400 });
      if (role === "admin") {
        const team = teamSnap.data();
        if (team?.leaderId !== myId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (eventId) {
        const eventSnap = await db.collection("events").doc(eventId).get();
        if (eventSnap.exists) {
          const ev = eventSnap.data()!;
          const teamIds = (ev.teamIds as string[]) || [];
          if (teamIds.includes(audienceId)) {
            const overrides = (ev.teamOverrides as Record<string, { memberIds?: string[] }> | undefined) ?? {};
            const override = overrides[audienceId];
            recipientIds = Array.isArray(override?.memberIds) ? override.memberIds : (Array.isArray(teamSnap.data()?.memberIds) ? (teamSnap.data()!.memberIds as string[]) : []);
          } else {
            recipientIds = Array.isArray(teamSnap.data()?.memberIds) ? (teamSnap.data()!.memberIds as string[]) : [];
          }
        } else {
          recipientIds = Array.isArray(teamSnap.data()?.memberIds) ? (teamSnap.data()!.memberIds as string[]) : [];
        }
      } else {
        recipientIds = Array.isArray(teamSnap.data()?.memberIds) ? (teamSnap.data()!.memberIds as string[]) : [];
      }
    } else if (audienceType === "individual" && audienceId) {
      recipientIds = [audienceId];
    }

    const templateSnap = await db.collection("templates").doc(templateId).get();
    if (!templateSnap.exists) return NextResponse.json({ error: "Template not found" }, { status: 400 });
    const templateData = templateSnap.data();
    const templateBody = (templateData?.body as string) || "";
    const templateName = (templateData?.name as string) || "Message";

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    const membersSnap2 = await db.collection("members").get();
    const membersMap: Record<string, { name: string; phone: string; email: string; teamIds: string[] }> = {};
    membersSnap2.docs.forEach((d) => {
      const x = d.data();
      const name = (x.name != null && String(x.name).trim()) ? String(x.name).trim() : [x.title, x.firstName, x.lastName].filter(Boolean).join(" ") || x.email || "";
      membersMap[d.id] = {
        name,
        phone: (x.phone != null && String(x.phone).trim()) ? String(x.phone).trim() : "",
        email: (x.email != null && String(x.email).trim()) ? String(x.email).trim().toLowerCase() : "",
        teamIds: Array.isArray(x.teamIds) ? x.teamIds : [],
      };
    });

    const teamsSnap = await db.collection("teams").get();
    const teamsMap: Record<string, string> = {};
    teamsSnap.docs.forEach((d) => {
      teamsMap[d.id] = (d.data().name as string) || d.id;
    });

    let totalSent = 0;
    let totalFailed = 0;
    const summaryParts: string[] = [];

    for (const channel of channels) {
      const useSmsGateForSms = channel === "sms" && isSmsGateConfigured();
      const useTwilioForSms = channel === "sms" && sid && authToken && fromNumber;
      const useTwilioForWhatsApp = channel === "whatsapp" && sid && authToken && fromNumber;
      const canSendSmsOrWhatsApp = (channel === "sms" && (useSmsGateForSms || useTwilioForSms)) || useTwilioForWhatsApp;

      if (channel === "email" && !isEmailConfigured()) {
        summaryParts.push("Email: not configured");
        continue;
      }
      if ((channel === "sms" || channel === "whatsapp") && !canSendSmsOrWhatsApp) {
        summaryParts.push(`${channel}: not configured`);
        continue;
      }

      let sent = 0;
      let failed = 0;
      let lastError: string | null = null;

      if (channel === "email" && isEmailConfigured()) {
        for (const memberId of recipientIds) {
          const member = membersMap[memberId];
          if (!member || !member.email) { failed++; continue; }
          const teamName = member.teamIds.length > 0 && teamsMap[member.teamIds[0]] != null ? teamsMap[member.teamIds[0]] : "";
          const text = resolveBody(templateBody, member.name, teamName);
          const result = await sendEmail({ to: member.email, subject: templateName, text });
          if (result.ok) sent++; else { console.error("Email send failed for", memberId, result.error); failed++; }
        }
        totalSent += sent;
        totalFailed += failed;
        summaryParts.push(`Email: ${sent} sent${failed > 0 ? `, ${failed} failed` : ""}`);
      } else if (channel === "sms" && useSmsGateForSms) {
        for (const memberId of recipientIds) {
          const member = membersMap[memberId];
          const e164 = member ? toE164(member.phone) : null;
          if (!member || !e164) { lastError = member ? "Phone invalid." : "Member not found."; failed++; continue; }
          const teamName = member.teamIds.length > 0 && teamsMap[member.teamIds[0]] != null ? teamsMap[member.teamIds[0]] : "";
          const text = resolveBody(templateBody, member.name, teamName);
          const result = await sendSmsGate({ message: text, phoneNumbers: [e164] });
          if (result.ok) sent++; else { lastError = result.error ?? "SMS error"; console.error("SMS Gate send failed for", memberId, result.error); failed++; }
        }
        totalSent += sent;
        totalFailed += failed;
        summaryParts.push(`SMS: ${sent} sent${failed > 0 ? `, ${failed} failed` : ""}${lastError ? ` (${lastError})` : ""});
      } else if ((channel === "sms" && useTwilioForSms) || (channel === "whatsapp" && useTwilioForWhatsApp)) {
        const client = twilio(sid, authToken);
        const from = channel === "whatsapp" ? "whatsapp:" + fromNumber : fromNumber;
        for (const memberId of recipientIds) {
          const member = membersMap[memberId];
          if (!member || !member.phone) { failed++; continue; }
          const teamName = member.teamIds.length > 0 && teamsMap[member.teamIds[0]] != null ? teamsMap[member.teamIds[0]] : "";
          const text = resolveBody(templateBody, member.name, teamName);
          const e164 = toE164(member.phone);
          if (!e164) { failed++; continue; }
          const to = channel === "whatsapp" ? "whatsapp:" + e164 : e164;
          try {
            await client.messages.create({ body: text, from, to });
            sent++;
          } catch (err) {
            console.error("Twilio send failed for", memberId, err);
            failed++;
          }
        }
        totalSent += sent;
        totalFailed += failed;
        summaryParts.push(`${channel}: ${sent} sent${failed > 0 ? `, ${failed} failed` : ""}`);
      }
    }

    const now = Date.now();
    await db.collection("messages").add({
      templateId,
      audienceType,
      audienceId: audienceId != null ? audienceId : null,
      channels,
      recipientIds,
      sentAt: now,
      createdBy: myId,
    });

    return NextResponse.json({
      ok: true,
      message: summaryParts.length > 0 ? summaryParts.join(". ") : "No channels configured.",
      recipientCount: recipientIds.length,
      sent: totalSent,
      failed: totalFailed,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
