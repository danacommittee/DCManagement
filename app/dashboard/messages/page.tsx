"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/api";
import type { Template } from "@/types";
import type { Team } from "@/types";
import type { Member } from "@/types";

export default function MessagesPage() {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [eventId, setEventId] = useState("");
  const [events, setEvents] = useState<{ id: string; name: string; teamIds?: string[] }[]>([]);
  const [eventTeams, setEventTeams] = useState<{ id: string; name: string }[]>([]);
  const [audienceType, setAudienceType] = useState<"individual" | "sub_team" | "entire_team">("entire_team");
  const [audienceId, setAudienceId] = useState("");
  const [channels, setChannels] = useState<("email" | "sms" | "whatsapp")[]>(["email"]);
  const [recipients, setRecipients] = useState<{ id: string; name: string }[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);

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
  }, [profile?.role]);

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
    (audienceType === "individual" && !!audienceId);

  useEffect(() => {
    if (!canFetchRecipients) {
      setRecipients([]);
      return;
    }
    setRecipientsLoading(true);
    const params = new URLSearchParams({ audienceType, ...(audienceId ? { audienceId } : {}), ...(eventId ? { eventId } : {}) });
    getAuthHeaders()
      .then((headers) => fetch(`/api/messages/recipients?${params}`, { headers }))
      .then((res) => (res.ok ? res.json() : { recipients: [] }))
      .then((d) => setRecipients(Array.isArray(d.recipients) ? d.recipients : []))
      .catch(() => setRecipients([]))
      .finally(() => setRecipientsLoading(false));
  }, [canFetchRecipients, audienceType, audienceId, eventId]);

  const toggleChannel = (ch: "email" | "sms" | "whatsapp") => {
    setChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  };

  const send = async () => {
    if (!templateId || channels.length === 0) return;
    setError(null);
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
          channels,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to send");
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
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

  const teamsForPicker = audienceType === "sub_team" && eventId && eventTeams.length > 0 ? eventTeams : teams;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Send Message</h1>
      {loading ? (
        <p className="text-stone-500">Loading...</p>
      ) : (
        <div className="max-w-lg space-y-4 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-800">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Template</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
            >
              <option value="">Select template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Event (optional)</label>
            <select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
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
              onChange={(e) => setAudienceType(e.target.value as typeof audienceType)}
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
            >
              <option value="entire_team">Entire team</option>
              <option value="sub_team">Sub-team</option>
              <option value="individual">Individual</option>
            </select>
          </div>
          {audienceType === "sub_team" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                Team {eventId ? "(event’s teams)" : "(default teams)"}
              </label>
              <select
                value={audienceId}
                onChange={(e) => setAudienceId(e.target.value)}
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
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Member</label>
              <select
                value={audienceId}
                onChange={(e) => setAudienceId(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              >
                <option value="">Select member</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300">Channels (select one or more)</label>
            <div className="flex flex-wrap gap-4">
              {(["email", "sms", "whatsapp"] as const).map((ch) => (
                <label key={ch} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={channels.includes(ch)}
                    onChange={() => toggleChannel(ch)}
                    className="rounded border-stone-300"
                  />
                  <span className="text-sm capitalize text-stone-700 dark:text-stone-300">{ch === "whatsapp" ? "WhatsApp" : ch === "sms" ? "SMS" : "Email"}</span>
                </label>
              ))}
            </div>
          </div>
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
          <button
            type="button"
            onClick={send}
            disabled={sending || !templateId || channels.length === 0}
            className="w-full rounded-lg bg-amber-600 py-2.5 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send"}
          </button>
          {error && (
            <p className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
