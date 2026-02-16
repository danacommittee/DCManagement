import { NextRequest, NextResponse } from "next/server";
import { authAdmin, db } from "@/lib/firebase-admin";
import { sendMessages } from "@/lib/message-sender";

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
    const channels = rawChannels.filter((c: string): c is "email" | "sms" | "whatsapp" => ["email", "sms", "whatsapp"].includes(c));

    if (!templateId || !["individual", "sub_team", "entire_team"].includes(audienceType)) {
      return NextResponse.json({ error: "Invalid templateId or audienceType" }, { status: 400 });
    }
    if (channels.length === 0) {
      return NextResponse.json({ error: "Select at least one channel (email, sms, or whatsapp)" }, { status: 400 });
    }

    // Compute sender display name for {{YourName}} placeholder
    const meData = membersSnap.docs[0].data();
    const senderName =
      (meData.name != null && String(meData.name).trim()) ||
      [meData.title, meData.firstName, meData.lastName].filter(Boolean).join(" ") ||
      meData.email ||
      "";

    // Check permissions for sub_team audience
    if (audienceType === "sub_team" && audienceId) {
      const teamSnap = await db.collection("teams").doc(audienceId).get();
      if (!teamSnap.exists) return NextResponse.json({ error: "Team not found" }, { status: 400 });
      if (role === "admin") {
        const team = teamSnap.data();
        if (team?.leaderId !== myId && team?.leader2Id !== myId) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }

    // Use the shared send function
    const result = await sendMessages({
      templateId,
      eventId: eventId || null,
      audienceType,
      audienceId,
      channels,
      senderId: myId,
      senderName,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error || "Failed to send messages" }, { status: 400 });
    }

    // Record the message in Firestore
    const now = Date.now();
    await db.collection("messages").add({
      templateId,
      audienceType,
      audienceId: audienceId != null ? audienceId : null,
      channels,
      recipientIds: result.recipientIds || [],
      sentAt: now,
      createdBy: myId,
    });

    return NextResponse.json({
      ok: true,
      message: result.message || "Messages sent",
      recipientCount: result.recipientCount,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
