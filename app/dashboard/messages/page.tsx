"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { getAuthHeaders } from "@/lib/api";
import type { Template } from "@/types";
import type { Team } from "@/types";
import type { Member } from "@/types";
import type { ScheduledMessage } from "@/types";

/** Format date for datetime-local input in the user's local time (avoids Android hour reverting when using UTC). */
function toLocalDatetimeLocalString(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${min}`;
}

/** Resolve only the placeholders we can fill from the form (event, team, sender). Leave {{Name}}, {{TeamMembers}}, {{TeamLeaders}}, {{TeamsList}} as-is so the server can replace them per recipient when sending. */
function resolvePreviewBody(
  body: string,
  opts: { eventName?: string; teamName?: string; senderName?: string }
): string {
  const eventName = opts.eventName ?? "—";
  const teamName = opts.teamName ?? "—";
  const senderName = opts.senderName ?? "—";
  return body
    .replace(/\{\{Team\}\}|\{\{team\}\}|\{\{TeamName\}\}/g, teamName)
    .replace(/\{\{YourName\}\}|\{\{your name\}\}/gi, senderName)
    .replace(/\{\{EventName\}\}|\{\{event name\}\}/gi, eventName);
  // Do NOT replace {{Name}}, {{TeamMembers}}, {{TeamLeaders}}, {{TeamsList}} — server fills those per recipient
}

export default function MessagesPage() {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; sent: number; failed: number; recipientCount: number } | null>(null);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [eventId, setEventId] = useState("");
  const [events, setEvents] = useState<{ id: string; name: string; teamIds?: string[] }[]>([]);
  const [eventTeams, setEventTeams] = useState<{ id: string; name: string }[]>([]);
  const [audienceType, setAudienceType] = useState<"individual" | "sub_team" | "entire_team">("entire_team");
  const [audienceId, setAudienceId] = useState("");
  const [audienceIds, setAudienceIds] = useState<string[]>([]);
  const [channels, setChannels] = useState<("email" | "sms" | "whatsapp")[]>(["email"]);
  const [recipients, setRecipients] = useState<{ id: string; name: string }[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [previewBody, setPreviewBody] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [scheduledMessagesLoading, setScheduledMessagesLoading] = useState(false);
  const [editingScheduledId, setEditingScheduledId] = useState<string | null>(null);
  const [editScheduleDateTime, setEditScheduleDateTime] = useState("");
  const [showScheduledMessages, setShowScheduledMessages] = useState(false);
  const hasHydratedLastUsed = useRef(false);
  const { toast } = useToast();

  const MESSAGES_LAST_USED_KEY = "dcms_messages_lastUsed";

  const templatesSorted = useMemo(() => {
    if (typeof window === "undefined") return templates;
    try {
      const raw = localStorage.getItem(MESSAGES_LAST_USED_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const lastId = parsed?.templateId;
      if (!lastId || !templates.some((t) => t.id === lastId)) return templates;
      const idx = templates.findIndex((t) => t.id === lastId);
      if (idx <= 0) return templates;
      const copy = [...templates];
      const [item] = copy.splice(idx, 1);
      copy.unshift(item);
      return copy;
    } catch {
      return templates;
    }
  }, [templates]);

  const fetchScheduledMessages = async () => {
    setScheduledMessagesLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/messages/schedule", { headers });
      if (res.ok) {
        const data = await res.json();
        setScheduledMessages(data.scheduledMessages || []);
      }
    } catch (e) {
      console.error("Failed to fetch scheduled messages:", e);
    } finally {
      setScheduledMessagesLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.role === "member") {
      setLoading(false);
      return;
    }
    const run = async () => {
      const headers = await getAuthHeaders();
      const [tRes, teamsRes, membersRes, eventsRes] = await Promise.all([
        fetch("/api/templates", { headers }),
        fetch("/api/teams", { headers }),
        fetch("/api/members", { headers }),
        fetch("/api/events?limit=100", { headers }),
      ]);
      if (tRes.ok) {
        const d = await tRes.json();
        setTemplates(d.templates ?? []);
      }
      if (teamsRes.ok) {
        const d = await teamsRes.json();
        setTeams(d.teams ?? []);
      }
      if (membersRes.ok) {
        const d = await membersRes.json();
        setMembers(d.members ?? []);
      }
      if (eventsRes?.ok) {
        const d = await eventsRes.json();
        setEvents(d.events ?? []);
      }
      setLoading(false);
    };
    run();
    fetchScheduledMessages();
  }, [profile?.role]);

  useEffect(() => {
    if (hasHydratedLastUsed.current || loading || templates.length === 0) return;
    try {
      const raw = localStorage.getItem(MESSAGES_LAST_USED_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object") return;
      hasHydratedLastUsed.current = true;
      if (parsed.templateId && templates.some((t) => t.id === parsed.templateId)) {
        setTemplateId(parsed.templateId);
      }
      if (parsed.eventId && events.some((e) => e.id === parsed.eventId)) {
        setEventId(parsed.eventId);
      }
      if (parsed.audienceId && teams.some((t) => t.id === parsed.audienceId)) {
        setAudienceId(parsed.audienceId);
      }
    } catch {
      hasHydratedLastUsed.current = true;
    }
  }, [loading, templates, events, teams]);

  const saveLastUsed = (updates: { templateId?: string; eventId?: string; audienceId?: string }) => {
    try {
      const raw = localStorage.getItem(MESSAGES_LAST_USED_KEY);
      const prev = raw ? JSON.parse(raw) : {};
      localStorage.setItem(MESSAGES_LAST_USED_KEY, JSON.stringify({ ...prev, ...updates }));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!eventId) {
      setEventTeams([]);
      setAudienceId("");
      return;
    }
    getAuthHeaders()
      .then((headers) => fetch(`/api/events/${eventId}`, { headers }))
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        const teamsList = d?.event?.teams ?? [];
        setEventTeams(teamsList.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
        setAudienceId("");
      })
      .catch(() => setEventTeams([]));
  }, [eventId]);

  const canFetchRecipients =
    audienceType === "entire_team" ||
    (audienceType === "sub_team" && !!audienceId) ||
    (audienceType === "individual" && (audienceIds.length > 0 || !!audienceId));

  useEffect(() => {
    if (!canFetchRecipients) {
      setRecipients([]);
      return;
    }
    setRecipientsLoading(true);
    const params = new URLSearchParams({
      audienceType,
      ...(eventId ? { eventId } : {}),
      ...(audienceType === "sub_team" && audienceId ? { audienceId } : {}),
      ...(audienceType === "individual" && audienceIds.length > 0 ? { audienceIds: audienceIds.join(",") } : {}),
      ...(audienceType === "individual" && audienceIds.length === 0 && audienceId ? { audienceId } : {}),
    });
    getAuthHeaders()
      .then((headers) => fetch(`/api/messages/recipients?${params}`, { headers }))
      .then((res) => (res.ok ? res.json() : { recipients: [] }))
      .then((d) => setRecipients(Array.isArray(d.recipients) ? d.recipients : []))
      .catch(() => setRecipients([]))
      .finally(() => setRecipientsLoading(false));
  }, [canFetchRecipients, audienceType, audienceId, audienceIds, eventId]);

  // Sync editable preview when template, event, or team selection changes (placeholder values update)
  const selectedTemplate = templates.find((t) => t.id === templateId);
  const selectedEvent = events.find((e) => e.id === eventId);
  const teamsForPicker = audienceType === "sub_team" && eventId && eventTeams.length > 0 ? eventTeams : teams;
  const selectedTeam = audienceId ? teamsForPicker.find((t) => t.id === audienceId) : null;
  useEffect(() => {
    if (!selectedTemplate?.body) {
      setPreviewBody("");
      return;
    }
    const eventName = selectedEvent?.name ?? "";
    const teamName = selectedTeam?.name ?? (audienceType === "entire_team" ? "All teams" : "");
    const senderName =
      (profile?.name != null && String(profile.name).trim()) || profile?.email || "";
    setPreviewBody(resolvePreviewBody(selectedTemplate.body, { eventName, teamName, senderName }));
  }, [selectedTemplate?.id, selectedTemplate?.body, selectedEvent?.name, audienceType, selectedTeam?.name, profile?.name, profile?.email]);

  const toggleChannel = (ch: "email" | "sms" | "whatsapp") => {
    if (ch === "whatsapp") return; // WhatsApp disabled for now
    setChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
    setSuccess(null);
    setError(null);
  };

  const send = async () => {
    if (!templateId || channels.length === 0) return;
    if (audienceType === "individual" && audienceIds.length === 0 && !audienceId) return;
    setError(null);
    setSuccess(null);
    setSending(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers,
        body: JSON.stringify({
          templateId,
          eventId: eventId || undefined,
          audienceType,
          audienceId: audienceType !== "entire_team" ? audienceId || undefined : undefined,
          audienceIds: audienceType === "individual" && audienceIds.length > 0 ? audienceIds : undefined,
          bodyOverride: previewBody.trim() || undefined,
          subjectOverride: channels.includes("email") && emailSubject.trim() ? emailSubject.trim() : undefined,
          channels: channels.filter((c) => c !== "whatsapp"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMsg = data.error || data.message || "Failed to send message";
        setError(errorMsg);
        toast(errorMsg, "error");
        return;
      }
      if (data.ok) {
        const sent = data.sent || 0;
        const failed = data.failed || 0;
        const recipientCount = data.recipientCount || 0;
        
        // If all messages failed, show as error
        if (sent === 0 && failed > 0) {
          const msg = `All messages failed to send. ${data.message || "Check the error details above or server logs for more information."}`;
          setError(msg);
          toast(msg, "error");
          return;
        }
        
        // If some succeeded and some failed, show success with warning
        if (sent > 0 && failed > 0) {
          const msg = `${data.message || "Message sent"} (${failed} failed)`;
          setSuccess({
            message: msg,
            sent,
            failed,
            recipientCount,
          });
          toast(`Message sent to ${sent} recipients (${failed} failed)`, "success");
          return;
        }
        
        // All succeeded
        setSuccess({
          message: data.message || "Message sent successfully",
          sent,
          failed,
          recipientCount,
        });
        toast(`Message sent to ${recipientCount} recipients`);
      } else {
        const msg = data.message || "Failed to send message";
        setError(msg);
        toast(msg, "error");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to send message";
      setError(msg);
      toast(msg, "error");
    } finally {
      setSending(false);
    }
  };

  const scheduleSend = async () => {
    if (!templateId || channels.length === 0 || !scheduleDateTime) return;
    setError(null);
    setSuccess(null);
    setScheduling(true);
    try {
      const scheduledTimestamp = new Date(scheduleDateTime).getTime();
      const now = Date.now();
      
      if (scheduledTimestamp <= now) {
        setError("Scheduled time must be in the future");
        toast("Scheduled time must be in the future", "error");
        setScheduling(false);
        return;
      }

      const headers = await getAuthHeaders();
      const res = await fetch("/api/messages/schedule", {
        method: "POST",
        headers,
        body: JSON.stringify({
          templateId,
          eventId: eventId || undefined,
          audienceType,
          audienceId: audienceType !== "entire_team" ? audienceId || undefined : undefined,
          audienceIds: audienceType === "individual" && audienceIds.length > 0 ? audienceIds : undefined,
          bodyOverride: previewBody.trim() || undefined,
          subjectOverride: channels.includes("email") && emailSubject.trim() ? emailSubject.trim() : undefined,
          channels: channels.filter((c) => c !== "whatsapp"),
          scheduledAt: scheduledTimestamp,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMsg = data.error || data.message || "Failed to schedule message";
        setError(errorMsg);
        toast(errorMsg, "error");
        return;
      }
      if (data.ok) {
        const scheduledDate = new Date(scheduledTimestamp).toLocaleString();
        setSuccess({
          message: `Message scheduled for ${scheduledDate}`,
          sent: 0,
          failed: 0,
          recipientCount: recipients.length,
        });
        toast(`Message scheduled for ${scheduledDate}`);
        setShowScheduleForm(false);
        setScheduleDateTime("");
        await fetchScheduledMessages(); // Refresh scheduled messages list
      } else {
        const msg = data.message || "Failed to schedule message";
        setError(msg);
        toast(msg, "error");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to schedule message";
      setError(msg);
      toast(msg, "error");
    } finally {
      setScheduling(false);
    }
  };

  if (profile?.role === "member") {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-stone-900 dark:text-white">Send Message</h1>
        <p className="text-stone-500">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Send Message</h1>
      {loading ? (
        <p className="text-stone-500">Loading...</p>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-800 lg:max-w-lg">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Template</label>
            <select
              value={templateId}
              onChange={(e) => {
                const v = e.target.value;
                setTemplateId(v);
                setSuccess(null);
                setError(null);
                saveLastUsed({ templateId: v });
              }}
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
            >
              <option value="">Select template</option>
              {templatesSorted.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Event (optional)</label>
            <select
              value={eventId}
              onChange={(e) => {
                const v = e.target.value;
                setEventId(v);
                saveLastUsed({ eventId: v });
              }}
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
            >
              <option value="">No event (default teams)</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Audience</label>
            <select
              value={audienceType}
              onChange={(e) => {
                const next = e.target.value as typeof audienceType;
                setAudienceType(next);
                if (next === "individual") {
                  setAudienceId("");
                  setAudienceIds([]);
                } else {
                  setAudienceIds([]);
                }
              }}
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
            >
              <option value="entire_team">Entire team</option>
              <option value="sub_team">Sub-team</option>
              <option value="individual">Individual (select multiple)</option>
            </select>
          </div>
          {audienceType === "sub_team" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                Team {eventId ? "(event’s teams)" : "(default teams)"}
              </label>
              <select
                value={audienceId}
                onChange={(e) => {
                  const v = e.target.value;
                  setAudienceId(v);
                  saveLastUsed({ audienceId: v });
                }}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              >
                <option value="">Select team</option>
                {teamsForPicker.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          {audienceType === "individual" && (
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">Members (select one or more)</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAudienceIds(members.map((m) => m.id));
                      setAudienceId("");
                    }}
                    className="text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAudienceIds([]);
                      setAudienceId("");
                    }}
                    className="text-xs font-medium text-stone-500 hover:underline dark:text-stone-400"
                  >
                    Clear all
                  </button>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto rounded border border-stone-300 bg-stone-50/50 py-2 pl-2 dark:border-stone-600 dark:bg-stone-900/30">
                {members.map((m) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-2 py-1 pl-2 text-sm text-stone-700 dark:text-stone-300">
                    <input
                      type="checkbox"
                      checked={audienceIds.includes(m.id)}
                      onChange={() => {
                        setAudienceIds((prev) =>
                          prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                        );
                        setAudienceId("");
                      }}
                      className="rounded border-stone-300"
                    />
                    <span>{m.name}{m.email ? ` (${m.email})` : ""}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                {audienceIds.length === 0 ? "No members selected" : `${audienceIds.length} selected`}
              </p>
            </div>
          )}
          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300">Channels (select one or more)</label>
            <div className="flex flex-wrap gap-4">
              {(["email", "sms", "whatsapp"] as const).map((ch) => {
                const isWhatsApp = ch === "whatsapp";
                return (
                  <label
                    key={ch}
                    className={`flex items-center gap-2 ${isWhatsApp ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  >
                    <input
                      type="checkbox"
                      checked={channels.includes(ch)}
                      onChange={() => toggleChannel(ch)}
                      disabled={isWhatsApp}
                      className="rounded border-stone-300"
                    />
                    <span className="text-sm capitalize text-stone-700 dark:text-stone-300">
                      {ch === "whatsapp" ? "WhatsApp (coming soon)" : ch === "sms" ? "SMS" : "Email"}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          {channels.includes("email") && (
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Email subject (optional)</label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Defaults to template name if blank"
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white dark:placeholder-stone-400"
              />
            </div>
          )}
          {canFetchRecipients && (
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Recipients ({recipients.length})</label>
              {recipientsLoading ? (
                <p className="text-sm text-stone-500">Loading…</p>
              ) : recipients.length === 0 ? (
                <p className="text-sm text-stone-500">No recipients for this selection.</p>
              ) : (
                <ul className="max-h-48 list-inside list-disc overflow-y-auto rounded border border-stone-200 bg-stone-50/50 py-2 pl-4 pr-2 text-sm text-stone-700 dark:border-stone-600 dark:bg-stone-900/30 dark:text-stone-300">
                  {recipients.map((r) => (
                    <li key={r.id}>{r.name}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={send}
              disabled={
                sending ||
                scheduling ||
                !templateId ||
                channels.filter((c) => c !== "whatsapp").length === 0 ||
                (audienceType === "individual" && audienceIds.length === 0 && !audienceId)
              }
              className="flex-1 rounded-lg bg-amber-600 py-2.5 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send"}
            </button>
            <button
              type="button"
              onClick={() => {
                const next = !showScheduleForm;
                setShowScheduleForm(next);
                if (next) {
                  const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
                  setScheduleDateTime(toLocalDatetimeLocalString(inOneHour));
                }
              }}
              disabled={
                sending ||
                scheduling ||
                !templateId ||
                channels.filter((c) => c !== "whatsapp").length === 0 ||
                (audienceType === "individual" && audienceIds.length === 0 && !audienceId)
              }
              className="flex-1 rounded-lg border-2 border-amber-600 bg-white py-2.5 font-medium text-amber-600 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-500 dark:bg-stone-800 dark:text-amber-400 dark:hover:bg-stone-700"
            >
              Schedule Send
            </button>
          </div>
          {showScheduleForm && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-600 dark:bg-stone-900/30">
              <label className="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300">
                Schedule Date & Time
              </label>
              <input
                type="datetime-local"
                value={scheduleDateTime}
                onChange={(e) => setScheduleDateTime(e.target.value)}
                min={toLocalDatetimeLocalString(new Date())}
                className="mb-3 w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={scheduleSend}
                  disabled={scheduling || !scheduleDateTime}
                  className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {scheduling ? "Scheduling..." : "Confirm Schedule"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowScheduleForm(false);
                    setScheduleDateTime("");
                  }}
                  className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {success && (
            <div className={`rounded-lg p-3 text-sm ${success.failed > 0 ? "bg-amber-50 dark:bg-amber-900/20" : "bg-green-50 dark:bg-green-900/20"}`}>
              <p className={`font-medium ${success.failed > 0 ? "text-amber-800 dark:text-amber-200" : "text-green-800 dark:text-green-200"}`}>
                {success.failed > 0 ? "⚠ Partial success" : "✓ Message sent successfully!"}
              </p>
              <p className={`mt-1 ${success.failed > 0 ? "text-amber-700 dark:text-amber-300" : "text-green-700 dark:text-green-300"}`}>
                {success.message}
              </p>
              <div className={`mt-2 space-y-1 text-xs ${success.failed > 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}`}>
                <p>Recipients: {success.recipientCount}</p>
                <p>Sent: {success.sent}</p>
                {success.failed > 0 && (
                  <p className="font-medium text-red-600 dark:text-red-400">
                    Failed: {success.failed} {success.recipientCount > 0 ? `(${Math.round((success.failed / success.recipientCount) * 100)}%)` : ""}
                  </p>
                )}
              </div>
            </div>
          )}
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm dark:bg-red-900/20">
              <p className="font-medium text-red-800 dark:text-red-200">✗ Failed to send message</p>
              <p className="mt-1 text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Live preview (editable); edits are used for send and do not change the template */}
        <div className="w-full rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-800 lg:max-w-md lg:min-w-[320px]">
          <h2 className="mb-2 text-lg font-medium text-stone-900 dark:text-white">Message preview</h2>
          <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
            Event, team, and your name are filled from your selection. Tags like {"{{Name}}"} and {"{{TeamsList}}"} are replaced with each recipient’s name and teams when you send. Edits here are used for this send only and do not change the template.
          </p>
          {selectedTemplate ? (
            <textarea
              value={previewBody}
              onChange={(e) => setPreviewBody(e.target.value)}
              placeholder="Select a template to see preview…"
              rows={12}
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm leading-relaxed text-stone-800 dark:border-stone-600 dark:bg-stone-700 dark:text-white dark:placeholder-stone-400"
            />
          ) : (
            <p className="rounded border border-dashed border-stone-300 py-8 text-center text-sm text-stone-500 dark:border-stone-600 dark:text-stone-400">
              Select a template to see a live preview.
            </p>
          )}
        </div>
        </div>
      )}
      
      {/* Scheduled Messages Section */}
      {!loading && (
        <div className="mt-8 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-800">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setShowScheduledMessages(!showScheduledMessages);
                if (!showScheduledMessages && scheduledMessages.length === 0) {
                  fetchScheduledMessages();
                }
              }}
              className="flex items-center gap-2 text-left"
            >
              <h2 className="text-xl font-semibold text-stone-900 dark:text-white">Scheduled Messages</h2>
              {scheduledMessages.length > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  {scheduledMessages.length}
                </span>
              )}
              <svg
                className={`h-5 w-5 text-stone-500 transition-transform dark:text-stone-400 ${
                  showScheduledMessages ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showScheduledMessages && (
              <button
                type="button"
                onClick={fetchScheduledMessages}
                disabled={scheduledMessagesLoading}
                className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700"
              >
                {scheduledMessagesLoading ? "Refreshing..." : "Refresh"}
              </button>
            )}
          </div>
          
          {showScheduledMessages && (
            <div className="mt-4">
              {scheduledMessagesLoading ? (
                <p className="text-stone-500">Loading scheduled messages...</p>
              ) : scheduledMessages.length === 0 ? (
                <p className="text-stone-500">No scheduled messages</p>
              ) : (
                <div className="space-y-3">
                  {scheduledMessages.map((msg) => {
                const template = templates.find((t) => t.id === msg.templateId);
                const scheduledDate = new Date(msg.scheduledAt);
                const isPast = scheduledDate.getTime() <= Date.now();
                const statusColors = {
                  pending: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
                  sending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
                  sent: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
                  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
                };
                
                return (
                  <div
                    key={msg.id}
                    className="rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-600 dark:bg-stone-900/30"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="font-medium text-stone-900 dark:text-white">
                            {template?.name || "Unknown Template"}
                          </span>
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusColors[msg.status] || statusColors.pending}`}>
                            {msg.status.charAt(0).toUpperCase() + msg.status.slice(1)}
                          </span>
                          {isPast && msg.status === "pending" && (
                            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                              Overdue
                            </span>
                          )}
                        </div>
                        <div className="space-y-1 text-sm text-stone-600 dark:text-stone-400">
                          <p>
                            <span className="font-medium">Scheduled:</span> {scheduledDate.toLocaleString()}
                          </p>
                          <p>
                            <span className="font-medium">Channels:</span> {msg.channels.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(", ")}
                          </p>
                          <p>
                            <span className="font-medium">Audience:</span> {msg.audienceType === "entire_team" ? "Entire Team" : msg.audienceType === "sub_team" ? "Sub-team" : "Individual"}
                          </p>
                          {msg.error && (
                            <p className="text-red-600 dark:text-red-400">
                              <span className="font-medium">Error:</span> {msg.error}
                            </p>
                          )}
                          {msg.sentAt && (
                            <p>
                              <span className="font-medium">Sent at:</span> {new Date(msg.sentAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="ml-4 flex gap-2">
                        {msg.status === "pending" && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingScheduledId(msg.id);
                                setEditScheduleDateTime(toLocalDatetimeLocalString(new Date(msg.scheduledAt)));
                              }}
                              className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!confirm("Delete this scheduled message?")) return;
                                try {
                                  const headers = await getAuthHeaders();
                                  const res = await fetch(`/api/messages/schedule/${msg.id}`, {
                                    method: "DELETE",
                                    headers,
                                  });
                                  if (res.ok) {
                                    await fetchScheduledMessages();
                                    setSuccess({
                                      message: "Scheduled message deleted",
                                      sent: 0,
                                      failed: 0,
                                      recipientCount: 0,
                                    });
                                    toast("Scheduled message deleted");
                                  } else {
                                    const data = await res.json().catch(() => ({}));
                                    const err = data.error || "Failed to delete scheduled message";
                                    setError(err);
                                    toast(err, "error");
                                  }
                                } catch (e) {
                                  setError("Failed to delete scheduled message");
                                  toast("Failed to delete scheduled message", "error");
                                }
                              }}
                              className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/20"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* Edit form */}
                    {editingScheduledId === msg.id && (
                      <div className="mt-4 rounded border border-stone-200 bg-white p-3 dark:border-stone-600 dark:bg-stone-800">
                        <label className="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300">
                          New Scheduled Date & Time
                        </label>
                        <input
                          type="datetime-local"
                          value={editScheduleDateTime}
                          onChange={(e) => setEditScheduleDateTime(e.target.value)}
                          min={toLocalDatetimeLocalString(new Date())}
                          className="mb-3 w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              if (!editScheduleDateTime) return;
                              const newTimestamp = new Date(editScheduleDateTime).getTime();
                              if (newTimestamp <= Date.now()) {
                                setError("Scheduled time must be in the future");
                                toast("Scheduled time must be in the future", "error");
                                return;
                              }
                              try {
                                const headers = await getAuthHeaders();
                                const res = await fetch(`/api/messages/schedule/${msg.id}`, {
                                  method: "PATCH",
                                  headers,
                                  body: JSON.stringify({ scheduledAt: newTimestamp }),
                                });
                                if (res.ok) {
                                  setEditingScheduledId(null);
                                  setEditScheduleDateTime("");
                                  await fetchScheduledMessages();
                                  setSuccess({
                                    message: "Scheduled message updated",
                                    sent: 0,
                                    failed: 0,
                                    recipientCount: 0,
                                  });
                                  toast("Scheduled message updated");
                                } else {
                                  const data = await res.json().catch(() => ({}));
                                  const err = data.error || "Failed to update scheduled message";
                                  setError(err);
                                  toast(err, "error");
                                }
                              } catch (e) {
                                setError("Failed to update scheduled message");
                                toast("Failed to update scheduled message", "error");
                              }
                            }}
                            className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingScheduledId(null);
                              setEditScheduleDateTime("");
                            }}
                            className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
