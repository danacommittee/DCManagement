"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { getAuthHeaders } from "@/lib/api";
import { Card, CardHeader } from "@/components/Card";

export default function SettingsPage() {
  const { profile, refetchProfile } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState(profile?.name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [notifyPush, setNotifyPush] = useState(profile?.notifyPush !== false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? "");
    setPhone(profile.phone ?? "");
    setNotifyPush(profile.notifyPush !== false);
  }, [profile]);

  if (!profile) return null;

  const ensurePushSubscription = async (): Promise<void> => {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      toast("Notifications are not supported in this browser", "error");
      return;
    }
    try {
      let permission = Notification.permission;
      if (permission !== "granted") {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") {
        toast("This browser has notifications blocked for this site. You can still receive alerts on other devices.", "error");
        return;
      }

      let registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration) {
        registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      }
      await navigator.serviceWorker.ready;

      const res = await fetch("/api/push/vapid-public");
      if (!res.ok) {
        toast("Notifications are not configured", "error");
        return;
      }
      const { publicKey } = (await res.json()) as { publicKey?: string };
      if (!publicKey) {
        toast("Notifications are not configured", "error");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const sub = subscription.toJSON();
      const headers = await getAuthHeaders();
      const postRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers,
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: sub.keys,
        }),
      });
      if (!postRes.ok) {
        const err = await postRes.json().catch(() => ({}));
        const msg = (err as { error?: string }).error || "Failed to save push subscription";
        toast(msg, "error");
        return;
      }
      toast("Push notifications enabled on this device");
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to enable push notifications";
      toast(msg, "error");
      return;
    }
  };

  const handleTogglePush = () => {
    const next = !notifyPush;
    setNotifyPush(next);
    if (next) {
      void ensurePushSubscription();
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/members/${profile.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = data.error || "Failed to update profile";
        toast(err, "error");
        return;
      }
      await refetchProfile();
      toast("Profile updated");
    } catch {
      toast("Failed to update profile", "error");
    } finally {
      setSavingProfile(false);
    }
  };

  const saveNotifications = async () => {
    setSavingNotifications(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/members/${profile.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          notifyPush,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = data.error || "Failed to update notifications";
        toast(err, "error");
        return;
      }
      await refetchProfile();
      toast("Notification preferences updated");
    } catch {
      toast("Failed to update notifications", "error");
    } finally {
      setSavingNotifications(false);
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Settings</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>Profile</CardHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Email</label>
              <p className="text-sm text-stone-600 dark:text-stone-400">{profile.email}</p>
            </div>
            <button
              type="button"
              onClick={saveProfile}
              disabled={savingProfile}
              className="mt-2 inline-flex min-h-[40px] items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {savingProfile ? "Saving…" : "Save profile"}
            </button>
          </div>
        </Card>

        <Card>
          <CardHeader>Notifications</CardHeader>
          <div className="space-y-4">
            <div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-stone-800 dark:text-stone-200">Email</p>
                  </div>
                  <div className="flex h-6 w-11 items-center rounded-full bg-amber-500 opacity-60">
                    <div className="ml-auto mr-1 h-4 w-4 rounded-full bg-white" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-stone-800 dark:text-stone-200">SMS</p>
                  </div>
                  <div className="flex h-6 w-11 items-center rounded-full bg-amber-500 opacity-60">
                    <div className="ml-auto mr-1 h-4 w-4 rounded-full bg-white" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-stone-800 dark:text-stone-200">Push notifications</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTogglePush}
                    className={`flex h-6 w-11 items-center rounded-full px-1 transition ${
                      notifyPush ? "bg-amber-500" : "bg-stone-300 dark:bg-stone-600"
                    }`}
                  >
                    <div
                      className={`h-4 w-4 rounded-full bg-white shadow transition ${
                        notifyPush ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={saveNotifications}
              disabled={savingNotifications}
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {savingNotifications ? "Saving…" : "Save notification settings"}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

