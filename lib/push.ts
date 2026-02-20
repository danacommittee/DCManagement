/**
 * Web Push notifications (e.g. 8 AM attendance reminders).
 * Set env: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (generate with: npx web-push generate-vapid-keys).
 */
import webpush from "web-push";
import { db } from "@/lib/firebase-admin";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    "mailto:support@example.com",
    vapidPublicKey,
    vapidPrivateKey
  );
}

export interface PushSubscriptionDoc {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  createdAt: number;
}

export function isPushConfigured(): boolean {
  return !!(vapidPublicKey && vapidPrivateKey);
}

export function getVapidPublicKey(): string | null {
  return vapidPublicKey ?? null;
}

/** Save a push subscription for a user (one subscription per device/browser) */
export async function saveSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string
): Promise<void> {
  await db.collection("push_subscriptions").add({
    userId,
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    userAgent: userAgent ?? null,
    createdAt: Date.now(),
  });
}

/** Get all push subscriptions for a user */
export async function getSubscriptionsByUser(userId: string): Promise<PushSubscriptionDoc[]> {
  const snap = await db
    .collection("push_subscriptions")
    .where("userId", "==", userId)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PushSubscriptionDoc & { id: string }));
}

/** Get all push subscriptions for multiple users. Returns Map<userId, PushSubscriptionDoc[]> */
export async function getSubscriptionsByUserIds(
  userIds: string[]
): Promise<Map<string, PushSubscriptionDoc[]>> {
  if (userIds.length === 0) return new Map();
  const uniq = [...new Set(userIds)];
  const result = new Map<string, PushSubscriptionDoc[]>();
  const batchSize = 10;
  for (let i = 0; i < uniq.length; i += batchSize) {
    const batch = uniq.slice(i, i + batchSize);
    const snap = await db
      .collection("push_subscriptions")
      .where("userId", "in", batch)
      .get();
    snap.docs.forEach((d) => {
      const data = d.data() as Omit<PushSubscriptionDoc, "userId"> & { userId: string };
      const userId = data.userId;
      if (!result.has(userId)) result.set(userId, []);
      result.get(userId)!.push({ ...data, userId });
    });
  }
  return result;
}

/** Send a push notification to a subscription */
export async function sendPushNotification(
  subscription: Pick<PushSubscriptionDoc, "endpoint" | "keys">,
  payload: { title: string; body?: string; url?: string }
): Promise<boolean> {
  if (!vapidPrivateKey) return false;
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify(payload),
      { TTL: 86400 }
    );
    return true;
  } catch (e) {
    console.error("[Push] send failed:", e);
    return false;
  }
}
