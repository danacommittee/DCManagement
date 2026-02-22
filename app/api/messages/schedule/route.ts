import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";
import type { ScheduledMessage } from "@/types";

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
    const audienceIds = Array.isArray(body.audienceIds) ? body.audienceIds.filter((id: unknown) => typeof id === "string").map((id: string) => String(id).trim()) : undefined;
    const bodyOverride = typeof body.bodyOverride === "string" ? body.bodyOverride : undefined;
    const subjectOverride = typeof body.subjectOverride === "string" ? body.subjectOverride : undefined;
    const rawChannels = Array.isArray(body.channels) ? body.channels : (typeof body.channel === "string" ? [body.channel] : []);
    const channels = rawChannels.filter((c: string): c is "email" | "sms" | "whatsapp" => ["email", "sms", "whatsapp"].includes(c));
    const scheduledAt = typeof body.scheduledAt === "number" ? body.scheduledAt : null;
    const recurrence = body.recurrence === "daily" || body.recurrence === "weekly" ? body.recurrence : null;
    const recurrenceTime = typeof body.recurrenceTime === "string" ? body.recurrenceTime.trim() : undefined;
    const recurrenceDayOfWeek = typeof body.recurrenceDayOfWeek === "number" && body.recurrenceDayOfWeek >= 0 && body.recurrenceDayOfWeek <= 6
      ? body.recurrenceDayOfWeek
      : undefined;

    if (!templateId || !["individual", "sub_team", "entire_team"].includes(audienceType)) {
      return NextResponse.json({ error: "Invalid templateId or audienceType" }, { status: 400 });
    }

    if (!scheduledAt || scheduledAt <= Date.now()) {
      return NextResponse.json({ error: "scheduledAt must be a future timestamp" }, { status: 400 });
    }

    if (channels.length === 0) {
      return NextResponse.json({ error: "At least one channel required" }, { status: 400 });
    }

    if (recurrence === "daily" && !recurrenceTime) {
      return NextResponse.json({ error: "recurrenceTime (HH:mm) required for daily recurrence" }, { status: 400 });
    }
    if (recurrence === "weekly" && (recurrenceTime == null || recurrenceDayOfWeek == null)) {
      return NextResponse.json({ error: "recurrenceTime and recurrenceDayOfWeek required for weekly recurrence" }, { status: 400 });
    }

    // Verify template exists
    const templateSnap = await db.collection("templates").doc(templateId).get();
    if (!templateSnap.exists) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Create scheduled message document
    // Firestore doesn't allow undefined values, so we conditionally include fields
    const scheduledMessage: Record<string, unknown> = {
      templateId,
      audienceType,
      channels,
      scheduledAt,
      status: "pending",
      createdAt: Date.now(),
      createdBy: myId,
    };

    // Only include optional fields if they have values
    if (eventId) {
      scheduledMessage.eventId = eventId;
    }
    if (audienceType !== "entire_team" && audienceId) {
      scheduledMessage.audienceId = audienceId;
    }
    if (audienceIds?.length) {
      scheduledMessage.audienceIds = audienceIds;
    }
    if (bodyOverride) {
      scheduledMessage.bodyOverride = bodyOverride;
    }
    if (subjectOverride) {
      scheduledMessage.subjectOverride = subjectOverride;
    }
    if (recurrence) {
      scheduledMessage.recurrence = recurrence;
      if (recurrenceTime) scheduledMessage.recurrenceTime = recurrenceTime;
      if (recurrenceDayOfWeek !== undefined) scheduledMessage.recurrenceDayOfWeek = recurrenceDayOfWeek;
    }

    const ref = await db.collection("scheduledMessages").add(scheduledMessage);

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e) {
    console.error("[Schedule Message] Error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await authAdmin.verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    const membersSnap = await db.collection("members").where("email", "==", email).limit(1).get();
    if (membersSnap.empty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const role = membersSnap.docs[0].data().role;
    if (role !== "super_admin" && role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const query = db.collection("scheduledMessages").orderBy("scheduledAt", "asc");
    const snap = status ? await query.where("status", "==", status).get() : await query.get();
    
    const scheduledMessages = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return NextResponse.json({ scheduledMessages });
  } catch (e) {
    console.error("[Get Scheduled Messages] Error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
