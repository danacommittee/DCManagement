import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import type { ScheduledMessage } from "@/types";
import { sendMessages } from "@/lib/message-sender";

/** Compute next run timestamp for recurring: daily at recurrenceTime, or weekly on recurrenceDayOfWeek at recurrenceTime. */
function getNextScheduledAt(opts: {
  recurrence: "daily" | "weekly";
  recurrenceTime: string;
  recurrenceDayOfWeek?: number;
  afterTimestamp: number;
}): number {
  const [h, m] = opts.recurrenceTime.split(":").map(Number);
  const after = new Date(opts.afterTimestamp);
  const next = new Date(after);
  next.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);

  if (opts.recurrence === "daily") {
    if (next.getTime() <= opts.afterTimestamp) next.setDate(next.getDate() + 1);
    return next.getTime();
  }
  // weekly: next occurrence of recurrenceDayOfWeek (0=Sun .. 6=Sat)
  const targetDay = opts.recurrenceDayOfWeek ?? 0;
  let daysToAdd = (targetDay - next.getDay() + 7) % 7;
  if (daysToAdd === 0 && next.getTime() <= opts.afterTimestamp) daysToAdd = 7;
  next.setDate(next.getDate() + daysToAdd);
  return next.getTime();
}

/** Build Firestore-safe payload for next recurring occurrence (no undefined values). */
function nextRecurrencePayload(msg: ScheduledMessage, nextAt: number, now: number): Record<string, unknown> {
  const o: Record<string, unknown> = {
    templateId: msg.templateId,
    audienceType: msg.audienceType,
    channels: msg.channels,
    scheduledAt: nextAt,
    status: "pending",
    createdAt: now,
    createdBy: msg.createdBy,
    recurrence: msg.recurrence,
    recurrenceTime: msg.recurrenceTime,
  };
  if (msg.eventId != null && msg.eventId !== "") o.eventId = msg.eventId;
  if (msg.audienceId != null && msg.audienceId !== "") o.audienceId = msg.audienceId;
  if (Array.isArray(msg.audienceIds) && msg.audienceIds.length > 0) o.audienceIds = msg.audienceIds;
  if (msg.bodyOverride != null && msg.bodyOverride !== "") o.bodyOverride = msg.bodyOverride;
  if (msg.subjectOverride != null && msg.subjectOverride !== "") o.subjectOverride = msg.subjectOverride;
  if (msg.recurrence === "weekly" && msg.recurrenceDayOfWeek != null) o.recurrenceDayOfWeek = msg.recurrenceDayOfWeek;
  if (msg.recurrenceEndDate != null && String(msg.recurrenceEndDate).trim() !== "") o.recurrenceEndDate = String(msg.recurrenceEndDate).trim().slice(0, 10);
  return o;
}

/** True if next run date (as YYYY-MM-DD) is past recurrenceEndDate. */
function isPastRecurrenceEnd(nextAt: number, recurrenceEndDate: string | null | undefined): boolean {
  if (recurrenceEndDate == null || String(recurrenceEndDate).trim() === "") return false;
  const endStr = String(recurrenceEndDate).trim().slice(0, 10);
  const nextStr = new Date(nextAt).toISOString().slice(0, 10);
  return nextStr > endStr;
}

/** Build Firestore-safe sendDetails (no undefined). */
function firestoreSafeSendDetails(
  details: { recipientId: string; recipientName: string; channels: { channel: string; ok: boolean; error?: string }[] }[] | undefined
): unknown[] | null {
  if (!details || details.length === 0) return null;
  return details.map((r) => ({
    recipientId: r.recipientId,
    recipientName: r.recipientName,
    channels: r.channels.map((c) => ({
      channel: c.channel,
      ok: c.ok,
      error: c.error != null ? c.error : null,
    })),
  }));
}

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

    const rawMessages = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }));
    const messages: ScheduledMessage[] = rawMessages
      .filter((msg) => {
        const m = msg as Record<string, unknown>;
        return (
          typeof m.templateId === "string" &&
          typeof m.audienceType === "string" &&
          Array.isArray(m.channels) &&
          typeof m.scheduledAt === "number" &&
          typeof m.createdBy === "string"
        );
      })
      .map((msg) => msg as unknown as ScheduledMessage)
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
        
        // Validate audience so we don't send with missing required data (and avoid null/Firestore issues)
        if (msg.audienceType === "sub_team" && (msg.audienceId == null || String(msg.audienceId).trim() === "")) {
          await db.collection("scheduledMessages").doc(msg.id).update({
            status: "failed",
            error: "Sub-team audience requires a team (audienceId).",
            sentAt: Date.now(),
          });
          failed++;
          continue;
        }
        if (msg.audienceType === "individual" && (!Array.isArray(msg.audienceIds) || msg.audienceIds.length === 0)) {
          await db.collection("scheduledMessages").doc(msg.id).update({
            status: "failed",
            error: "Individual audience requires at least one member (audienceIds).",
            sentAt: Date.now(),
          });
          failed++;
          continue;
        }

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
          audienceId: msg.audienceId != null && String(msg.audienceId).trim() !== "" ? msg.audienceId : undefined,
          audienceIds: Array.isArray(msg.audienceIds) && msg.audienceIds.length > 0 ? msg.audienceIds : undefined,
          bodyOverride: typeof msg.bodyOverride === "string" ? msg.bodyOverride : undefined,
          subjectOverride: typeof msg.subjectOverride === "string" ? msg.subjectOverride : undefined,
          channels: msg.channels,
          senderId: msg.createdBy,
          senderName,
        });

        const now = Date.now();
        const sendDetails = firestoreSafeSendDetails(sendResult.details);
        if (sendResult.ok && sendResult.failed === 0) {
          await db.collection("scheduledMessages").doc(msg.id).update({
            status: "sent",
            sentAt: now,
            ...(sendDetails != null ? { sendDetails } : {}),
          });
          processed++;
          console.log(`[Process Scheduled] Successfully sent message ${msg.id}`);
          // Schedule next occurrence for recurring (unless past recurrenceEndDate)
          if (msg.recurrence === "daily" && msg.recurrenceTime) {
            const nextAt = getNextScheduledAt({
              recurrence: "daily",
              recurrenceTime: msg.recurrenceTime,
              afterTimestamp: now,
            });
            if (!isPastRecurrenceEnd(nextAt, msg.recurrenceEndDate)) {
              await db.collection("scheduledMessages").add(nextRecurrencePayload(msg, nextAt, now));
              console.log(`[Process Scheduled] Created next daily run at ${new Date(nextAt).toISOString()}`);
            }
          } else if (msg.recurrence === "weekly" && msg.recurrenceTime != null && msg.recurrenceDayOfWeek != null) {
            const nextAt = getNextScheduledAt({
              recurrence: "weekly",
              recurrenceTime: msg.recurrenceTime,
              recurrenceDayOfWeek: msg.recurrenceDayOfWeek,
              afterTimestamp: now,
            });
            if (!isPastRecurrenceEnd(nextAt, msg.recurrenceEndDate)) {
              await db.collection("scheduledMessages").add(nextRecurrencePayload(msg, nextAt, now));
              console.log(`[Process Scheduled] Created next weekly run at ${new Date(nextAt).toISOString()}`);
            }
          }
        } else if (sendResult.ok && sendResult.sent > 0) {
          // Partial success - some sent, some failed
          await db.collection("scheduledMessages").doc(msg.id).update({
            status: "sent",
            sentAt: now,
            error: `Partial: ${sendResult.failed} failed`,
            ...(sendDetails != null ? { sendDetails } : {}),
          });
          processed++;
          console.log(`[Process Scheduled] Partially sent message ${msg.id} (${sendResult.sent} sent, ${sendResult.failed} failed)`);
          // Still schedule next occurrence for recurring
          if (msg.recurrence === "daily" && msg.recurrenceTime) {
            const nextAt = getNextScheduledAt({
              recurrence: "daily",
              recurrenceTime: msg.recurrenceTime,
              afterTimestamp: now,
            });
            if (!isPastRecurrenceEnd(nextAt, msg.recurrenceEndDate)) {
              await db.collection("scheduledMessages").add(nextRecurrencePayload(msg, nextAt, now));
            }
          } else if (msg.recurrence === "weekly" && msg.recurrenceTime != null && msg.recurrenceDayOfWeek != null) {
            const nextAt = getNextScheduledAt({
              recurrence: "weekly",
              recurrenceTime: msg.recurrenceTime,
              recurrenceDayOfWeek: msg.recurrenceDayOfWeek,
              afterTimestamp: now,
            });
            if (!isPastRecurrenceEnd(nextAt, msg.recurrenceEndDate)) {
              await db.collection("scheduledMessages").add(nextRecurrencePayload(msg, nextAt, now));
            }
          }
        } else {
          // Total failure (no messages sent). We still want the recurring schedule
          // to continue on future days, so we mark this run as failed but still
          // create the next occurrence (if within recurrenceEndDate).
          await db.collection("scheduledMessages").doc(msg.id).update({
            status: "failed",
            error: sendResult.error || "Unknown error",
            sentAt: now,
            ...(sendDetails != null ? { sendDetails } : {}),
          });
          failed++;
          console.error(`[Process Scheduled] Failed to send message ${msg.id}:`, sendResult.error);

          if (msg.recurrence === "daily" && msg.recurrenceTime) {
            const nextAt = getNextScheduledAt({
              recurrence: "daily",
              recurrenceTime: msg.recurrenceTime,
              afterTimestamp: now,
            });
            if (!isPastRecurrenceEnd(nextAt, msg.recurrenceEndDate)) {
              await db.collection("scheduledMessages").add(nextRecurrencePayload(msg, nextAt, now));
            }
          } else if (msg.recurrence === "weekly" && msg.recurrenceTime != null && msg.recurrenceDayOfWeek != null) {
            const nextAt = getNextScheduledAt({
              recurrence: "weekly",
              recurrenceTime: msg.recurrenceTime,
              recurrenceDayOfWeek: msg.recurrenceDayOfWeek,
              afterTimestamp: now,
            });
            if (!isPastRecurrenceEnd(nextAt, msg.recurrenceEndDate)) {
              await db.collection("scheduledMessages").add(nextRecurrencePayload(msg, nextAt, now));
            }
          }
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
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[Process Scheduled Messages] Error:", message, stack);
    // Return 200 with ok: false so cron-job.org doesn't disable the job after repeated failures.
    // Include error details for debugging. Check Vercel logs and env vars (FIREBASE_SERVICE_ACCOUNT_JSON, CRON_SECRET).
    return NextResponse.json({
      ok: false,
      error: "Server error",
      details: message,
      hint: "Check Vercel Function Logs and ensure FIREBASE_SERVICE_ACCOUNT_JSON is set in Vercel env (not only GOOGLE_APPLICATION_CREDENTIALS).",
    }, { status: 200 });
  }
}
