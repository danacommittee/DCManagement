import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import type { ScheduledMessage } from "@/types";
import { sendMessages } from "@/lib/message-sender";

/**
 * This endpoint processes scheduled messages that are due to be sent.
 * It should be called periodically (e.g., via Vercel Cron Jobs or external cron service).
 * 
 * To set up Vercel Cron:
 * 1. Create vercel.json with cron configuration (already done)
 * 2. Ensure Vercel Cron Jobs are enabled on your Vercel account (Pro plan required)
 * 
 * To set up external cron (e.g., cron-job.org):
 * 1. Set CRON_SECRET in environment variables
 * 2. Configure cron service to call: https://your-domain.com/api/messages/process-scheduled
 * 3. Add header: Authorization: Bearer YOUR_CRON_SECRET
 */
export async function GET(req: NextRequest) {
  // Check for Vercel Cron secret header (Vercel sends this automatically)
  const vercelCronSecret = req.headers.get("x-vercel-cron-secret");
  const authHeader = req.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  // Allow if: Vercel Cron header matches, OR Authorization header matches CRON_SECRET, OR no CRON_SECRET is set (for local dev)
  const isVercelCron = vercelCronSecret === process.env.CRON_SECRET;
  const isAuthorized = !cronSecret || authHeader === `Bearer ${cronSecret}` || isVercelCron;
  
  if (!isAuthorized && cronSecret) {
    console.warn("[Process Scheduled] Unauthorized access attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = Date.now();
    console.log(`[Process Scheduled] Checking for messages due at ${new Date(now).toISOString()}`);
    
    // Get all pending scheduled messages that are due (scheduledAt <= now)
    // Note: We avoid orderBy to prevent needing a composite index
    // We'll sort in memory instead
    const snap = await db
      .collection("scheduledMessages")
      .where("status", "==", "pending")
      .where("scheduledAt", "<=", now)
      .limit(50) // Process up to 50 at a time
      .get();
    
    console.log(`[Process Scheduled] Found ${snap.size} pending messages`);

    if (snap.empty) {
      return NextResponse.json({ ok: true, processed: 0, message: "No scheduled messages to process" });
    }

    const messages = snap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }))
      .filter((msg): msg is ScheduledMessage => {
        // Type guard to ensure we have a valid ScheduledMessage
        return (
          typeof msg.templateId === "string" &&
          typeof msg.audienceType === "string" &&
          Array.isArray(msg.channels) &&
          typeof msg.scheduledAt === "number" &&
          typeof msg.createdBy === "string"
        );
      })
      .sort((a, b) => a.scheduledAt - b.scheduledAt); // Sort by scheduledAt ascending

    if (messages.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, message: "No valid scheduled messages to process" });
    }

    console.log(`[Process Scheduled] Processing ${messages.length} messages`);
    let processed = 0;
    let failed = 0;

    for (const msg of messages) {
      try {
        console.log(`[Process Scheduled] Processing message ${msg.id}, scheduled for ${new Date(msg.scheduledAt).toISOString()}`);
        
        // Mark as sending
        await db.collection("scheduledMessages").doc(msg.id).update({
          status: "sending",
        });

        // Get sender info
        const senderSnap = await db.collection("members").doc(msg.createdBy).get();
        if (!senderSnap.exists) {
          throw new Error("Sender not found");
        }
        const senderData = senderSnap.data()!;
        const senderName =
          (senderData.name != null && String(senderData.name).trim()) ||
          [senderData.title, senderData.firstName, senderData.lastName].filter(Boolean).join(" ") ||
          senderData.email ||
          "";

        // Send the message using the shared send function
        const sendResult = await sendMessages({
          templateId: msg.templateId,
          eventId: msg.eventId || null,
          audienceType: msg.audienceType,
          audienceId: msg.audienceId,
          channels: msg.channels,
          senderId: msg.createdBy,
          senderName,
        });

        if (sendResult.ok && sendResult.failed === 0) {
          await db.collection("scheduledMessages").doc(msg.id).update({
            status: "sent",
            sentAt: Date.now(),
          });
          processed++;
          console.log(`[Process Scheduled] Successfully sent message ${msg.id}`);
        } else if (sendResult.ok && sendResult.sent > 0) {
          // Partial success - some sent, some failed
          await db.collection("scheduledMessages").doc(msg.id).update({
            status: "sent",
            sentAt: Date.now(),
            error: `Partial: ${sendResult.failed} failed`,
          });
          processed++;
          console.log(`[Process Scheduled] Partially sent message ${msg.id} (${sendResult.sent} sent, ${sendResult.failed} failed)`);
        } else {
          await db.collection("scheduledMessages").doc(msg.id).update({
            status: "failed",
            error: sendResult.error || "Unknown error",
            sentAt: Date.now(),
          });
          failed++;
          console.error(`[Process Scheduled] Failed to send message ${msg.id}:`, sendResult.error);
        }
      } catch (err) {
        console.error(`[Process Scheduled] Failed to process message ${msg.id}:`, err);
        await db.collection("scheduledMessages").doc(msg.id).update({
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          sentAt: Date.now(),
        });
        failed++;
      }
    }

    const result = {
      ok: true,
      processed,
      failed,
      total: messages.length,
      message: `Processed ${processed} messages, ${failed} failed`,
      timestamp: new Date().toISOString(),
    };
    console.log(`[Process Scheduled] Result:`, result);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[Process Scheduled Messages] Error:", e);
    return NextResponse.json({ error: "Server error", details: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
