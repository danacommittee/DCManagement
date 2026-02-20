"use client";

import { useState, useEffect } from "react";
import { getAuthHeaders } from "@/lib/api";

export function PushSubscribe() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "unsupported" | "denied">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") setStatus("denied");
  }, []);

  const subscribe = async () => {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }
    setStatus("loading");
    setMessage(null);
    try {
      let permission = Notification.permission;
      if (permission !== "granted") {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") {
        setStatus("denied");
        setMessage("Permission denied");
        return;
      }

      let registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration) {
        registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      }
      await navigator.serviceWorker.ready;

      const res = await fetch("/api/push/vapid-public");
      if (!res.ok) {
        setMessage("Notifications not configured");
        setStatus("idle");
        return;
      }
      const { publicKey } = await res.json();
      if (!publicKey) {
        setMessage("Notifications not configured");
        setStatus("idle");
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
        setMessage(err.error || "Failed to save subscription");
        setStatus("idle");
        return;
      }
      setStatus("done");
      setMessage("You'll get reminders at 8 AM when you're scheduled.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to enable");
      setStatus("idle");
    }
  };

  if (status === "unsupported") return null;
  if (status === "denied") {
    return (
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Notifications blocked. Enable them in browser settings to get reminders.
      </p>
    );
  }
  if (status === "done") {
    return <p className="text-xs text-green-600 dark:text-green-400">{message}</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={subscribe}
        disabled={status === "loading"}
        className="text-xs font-medium text-amber-600 hover:underline disabled:opacity-50 dark:text-amber-400"
      >
        {status === "loading" ? "Enabling…" : "Enable 8 AM attendance reminders"}
      </button>
      {message && <span className="text-xs text-red-600 dark:text-red-400">{message}</span>}
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
