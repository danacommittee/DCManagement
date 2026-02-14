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
    const channel = body.channel;

    if (!templateId || !["individual", "sub_team", "entire_team"].includes(audienceType) || !["whatsapp", "sms", "email"].includes(channel)) {
      return NextResponse.json({ error: "Invalid templateId, audienceType, or channel" }, { status: 400 });
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
    const useSmsGateForSms = channel === "sms" && isSmsGateConfigured();
    const useTwilioForSms = channel === "sms" && sid && authToken && fromNumber;
    const useTwilioForWhatsApp = channel === "whatsapp" && sid && authToken && fromNumber;
    const canSendSmsOrWhatsApp =
      (channel === "sms" && (useSmsGateForSms || useTwilioForSms)) || useTwilioForWhatsApp;

    if (channel === "email" && !isEmailConfigured()) {
      return NextResponse.json({
        ok: true,
        message: "Email not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS to .env.local (e.g. Gmail).",
        recipientCount: recipientIds.length,
      });
    }

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

    let sent = 0;
    let failed = 0;
    let lastError: string | null = null;

    if (channel === "email" && isEmailConfigured()) {
      for (const memberId of recipientIds) {
        const member = membersMap[memberId];
        if (!member || !member.email) {
          failed++;
          continue;
        }
        const teamName = member.teamIds.length > 0 && teamsMap[member.teamIds[0]] != null ? teamsMap[member.teamIds[0]] : "";
        const text = resolveBody(templateBody, member.name, teamName);
        const result = await sendEmail({
          to: member.email,
          subject: templateName,
          text,
        });
        if (result.ok) sent++;
        else {
          console.error("Email send failed for", memberId, result.error);
          failed++;
        }
      }
    } else if (useSmsGateForSms) {
      for (const memberId of recipientIds) {
        const member = membersMap[memberId];
        const e164 = member ? toE164(member.phone) : null;
        if (!member || !e164) {
          lastError = member ? "Phone could not be normalized to E.164 (need at least 10 digits)." : "Member not found.";
          failed++;
          continue;
        }
        const teamName = member.teamIds.length > 0 && teamsMap[member.teamIds[0]] != null ? teamsMap[member.teamIds[0]] : "";
        const text = resolveBody(templateBody, member.name, teamName);
        const result = await sendSmsGate({ message: text, phoneNumbers: [e164] });
        if (result.ok) sent++;
        else {
          lastError = result.error ?? "SMS Gate error";
          console.error("SMS Gate send failed for", memberId, result.error);
          failed++;
        }
      }
    } else if (useTwilioForSms || useTwilioForWhatsApp) {
      const client = twilio(sid, authToken);
      const from = channel === "whatsapp" ? "whatsapp:" + fromNumber : fromNumber;
      for (const memberId of recipientIds) {
        const member = membersMap[memberId];
        if (!member || !member.phone) {
          failed++;
          continue;
        }
        const teamName = member.teamIds.length > 0 && teamsMap[member.teamIds[0]] != null ? teamsMap[member.teamIds[0]] : "";
        const text = resolveBody(templateBody, member.name, teamName);
        const e164 = toE164(member.phone);
        if (!e164) {
          failed++;
          continue;
        }
        const to = channel === "whatsapp" ? "whatsapp:" + e164 : e164;
        try {
          await client.messages.create({ body: text, from, to });
          sent++;
        } catch (err) {
          console.error("Twilio send failed for", memberId, err);
          failed++;
        }
      }
    }

    const now = Date.now();
    await db.collection("messages").add({
      templateId,
      audienceType,
      audienceId: audienceId != null ? audienceId : null,
      channel,
      recipientIds,
      sentAt: now,
      createdBy: myId,
    });

    if (channel === "email") {
      return NextResponse.json({
        ok: true,
        message: `Sent ${sent} email(s).${failed > 0 ? ` ${failed} failed (missing email or SMTP error).` : ""}`,
        recipientCount: recipientIds.length,
        sent,
        failed,
      });
    }

    if (canSendSmsOrWhatsApp) {
      const provider = useSmsGateForSms ? "SMS Gate" : "Twilio";
      const failDetail = failed > 0 && lastError ? ` ${lastError}` : (failed > 0 ? ` ${failed} failed (missing phone or send error).` : "");
      return NextResponse.json({
        ok: true,
        message: `Sent ${sent} message(s) via ${channel} (${provider}).${failed > 0 ? ` ${failed} failed.` : ""}${failDetail}`,
        recipientCount: recipientIds.length,
        sent,
        failed,
        lastError: lastError ?? undefined,
      });
    }

    const hint = channel === "sms"
      ? "Set SMS_GATE_USERNAME and SMS_GATE_PASSWORD, or Twilio credentials, in .env.local."
      : "Twilio credentials not set. Message logged only.";
    return NextResponse.json({
      ok: true,
      message: hint,
      recipientCount: recipientIds.length,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
