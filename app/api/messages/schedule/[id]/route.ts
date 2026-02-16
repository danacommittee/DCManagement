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
    
    // Only allow editing pending messages
    if (msgData.status !== "pending") {
      return NextResponse.json({ error: "Can only edit pending messages" }, { status: 400 });
    }
    
    // Only allow creator or super_admin to edit
    if (msgData.createdBy !== myId && role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    
    // Allow updating scheduledAt if provided
    if (typeof body.scheduledAt === "number") {
      if (body.scheduledAt <= Date.now()) {
        return NextResponse.json({ error: "scheduledAt must be in the future" }, { status: 400 });
      }
      updates.scheduledAt = body.scheduledAt;
    }
    
    // Allow updating channels if provided
    if (Array.isArray(body.channels)) {
      const channels = body.channels.filter((c: string): c is "email" | "sms" | "whatsapp" => 
        ["email", "sms", "whatsapp"].includes(c)
      );
      if (channels.length === 0) {
        return NextResponse.json({ error: "At least one channel required" }, { status: 400 });
      }
      updates.channels = channels;
    }

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
    
    // Only allow deleting pending or sending messages (not sent/failed)
    if (msgData.status === "sent") {
      return NextResponse.json({ error: "Cannot delete sent messages" }, { status: 400 });
    }
    
    // Only allow creator or super_admin to delete
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
