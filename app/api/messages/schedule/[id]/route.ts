import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await req.json();
    
    // Get the scheduled message
    const msgSnap = await db.collection("scheduledMessages").doc(id).get();
    if (!msgSnap.exists) {
      return NextResponse.json({ error: "Scheduled message not found" }, { status: 404 });
    }
    
    const msgData = msgSnap.data()!;
    const status = msgData.status as string;
    const recurrence = msgData.recurrence as string | undefined;
    const recurrenceEndDate = typeof msgData.recurrenceEndDate === "string" ? msgData.recurrenceEndDate.slice(0, 10) : null;
    const isRecurring = recurrence === "daily" || recurrence === "weekly";
    const todayStr = new Date().toISOString().slice(0, 10);
    const pastEndDate = recurrenceEndDate != null && recurrenceEndDate !== "" && todayStr > recurrenceEndDate;

    // Allow editing: pending messages, or sent/failed recurring messages until their end date (if any)
    const canEdit =
      status === "pending" ||
      (isRecurring && (status === "sent" || status === "failed") && !pastEndDate);
    if (!canEdit) {
      return NextResponse.json(
        { error: pastEndDate ? "Recurring series has ended" : "Can only edit pending or recurring messages" },
        { status: 400 }
      );
    }

    // Only allow creator or super_admin to edit
    if (msgData.createdBy !== myId && role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    // When rescheduling a sent/failed recurring message, set it back to pending and require new scheduledAt
    if (status === "sent" || status === "failed") {
      if (typeof body.scheduledAt !== "number" || body.scheduledAt <= Date.now()) {
        return NextResponse.json({ error: "scheduledAt (future timestamp) is required to reschedule this recurring message" }, { status: 400 });
      }
      updates.status = "pending";
      updates.scheduledAt = body.scheduledAt;
      updates.sentAt = null;
      updates.error = null;
    }

    // scheduledAt (for pending messages)
    if (status === "pending" && typeof body.scheduledAt === "number") {
      if (body.scheduledAt <= Date.now()) {
        return NextResponse.json({ error: "scheduledAt must be in the future" }, { status: 400 });
      }
      updates.scheduledAt = body.scheduledAt;
    }

    // channels
    if (Array.isArray(body.channels)) {
      const channels = body.channels.filter((c: string): c is "email" | "sms" | "whatsapp" | "push" =>
        ["email", "sms", "whatsapp", "push"].includes(c)
      );
      if (channels.length === 0) {
        return NextResponse.json({ error: "At least one channel required" }, { status: 400 });
      }
      updates.channels = channels;
    }

    // recurrence (only set defined; omit undefined so Firestore is happy)
    if (body.recurrence === "daily" || body.recurrence === "weekly" || body.recurrence === null || body.recurrence === undefined) {
      if (body.recurrence === "daily") {
        updates.recurrence = "daily";
        if (typeof body.recurrenceTime === "string" && body.recurrenceTime.trim()) {
          updates.recurrenceTime = body.recurrenceTime.trim();
        }
        updates.recurrenceDayOfWeek = null; // clear for daily
      } else if (body.recurrence === "weekly") {
        updates.recurrence = "weekly";
        if (typeof body.recurrenceTime === "string" && body.recurrenceTime.trim()) {
          updates.recurrenceTime = body.recurrenceTime.trim();
        }
        if (typeof body.recurrenceDayOfWeek === "number" && body.recurrenceDayOfWeek >= 0 && body.recurrenceDayOfWeek <= 6) {
          updates.recurrenceDayOfWeek = body.recurrenceDayOfWeek;
        }
      } else {
        updates.recurrence = null;
        updates.recurrenceTime = null;
        updates.recurrenceDayOfWeek = null;
        updates.recurrenceEndDate = null;
      }
    }
    if (body.recurrenceEndDate !== undefined) {
      updates.recurrenceEndDate = body.recurrenceEndDate ? String(body.recurrenceEndDate).trim().slice(0, 10) : null;
    }

    // optional fields (only set if provided; do not write undefined)
    if (typeof body.templateId === "string" && body.templateId.trim()) {
      const templateSnap = await db.collection("templates").doc(body.templateId.trim()).get();
      if (!templateSnap.exists) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }
      updates.templateId = body.templateId.trim();
    }
    if (body.eventId !== undefined) updates.eventId = body.eventId ? String(body.eventId).trim() : null;
    if (["individual", "sub_team", "entire_team"].includes(body.audienceType)) updates.audienceType = body.audienceType;
    if (body.audienceId !== undefined) updates.audienceId = body.audienceId ? String(body.audienceId).trim() : null;
    if (body.audienceIds !== undefined) {
      updates.audienceIds = Array.isArray(body.audienceIds) ? body.audienceIds.filter((id: unknown) => typeof id === "string").map((id: string) => String(id).trim()) : null;
    }
    if (body.bodyOverride !== undefined) updates.bodyOverride = body.bodyOverride ? String(body.bodyOverride).trim() : null;
    if (body.subjectOverride !== undefined) updates.subjectOverride = body.subjectOverride ? String(body.subjectOverride).trim() : null;

    await db.collection("scheduledMessages").doc(id).update(updates);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[Update Scheduled Message] Error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    
    // Get the scheduled message
    const msgSnap = await db.collection("scheduledMessages").doc(id).get();
    if (!msgSnap.exists) {
      return NextResponse.json({ error: "Scheduled message not found" }, { status: 404 });
    }
    
    const msgData = msgSnap.data()!;
    
    // Allow creator or super_admin to delete (any status, including sent/failed e.g. to stop recurring or cleanup)
    if (msgData.createdBy !== myId && role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.collection("scheduledMessages").doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[Delete Scheduled Message] Error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
