"use client";

import { useState, useEffect, useRef } from "react";
import { getAuthHeaders } from "@/lib/api";

const PUSH_DENIED_KEY = "dcms_push_denied";

export function PushSubscribe() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "unsupported" | "denied">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const hasAutoRun = useRef(false);

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
        try {
          localStorage.setItem(PUSH_DENIED_KEY, "1");
        } catch {
          // ignore
        }
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

  // Auto-run subscription once on first visit (permission default or already granted)
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    try {
      if (Notification.permission === "default" && localStorage.getItem(PUSH_DENIED_KEY)) {
        setStatus("denied");
        return;
      }
    } catch {
      // ignore
    }
    if (hasAutoRun.current) return;
    hasAutoRun.current = true;
    const timer = setTimeout(() => {
      subscribe();
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  if (status === "unsupported") return null;
  if (status === "denied") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Notifications blocked. Enable them in browser settings to get reminders.
        </p>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.removeItem(PUSH_DENIED_KEY);
            } catch {
              // ignore
            }
            setStatus("idle");
            setMessage(null);
            subscribe();
          }}
          className="text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
        >
          Try again
        </button>
      </div>
    );
  }
  if (status === "done") {
    return <p className="text-xs text-green-600 dark:text-green-400">{message}</p>;
  }
  if (status === "loading") {
    return <p className="text-xs text-stone-500 dark:text-stone-400">Enabling notifications…</p>;
  }
  return null;
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
