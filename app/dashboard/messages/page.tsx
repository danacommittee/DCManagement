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
  const [message, setMessage] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [audienceType, setAudienceType] = useState<"individual" | "sub_team" | "entire_team">("entire_team");
  const [audienceId, setAudienceId] = useState("");
  const [channel, setChannel] = useState<"whatsapp" | "sms" | "email">("email");

  useEffect(() => {
    if (profile?.role === "member") {
      setLoading(false);
      return;
    }
    const run = async () => {
      const headers = await getAuthHeaders();
      const [tRes, teamsRes, membersRes] = await Promise.all([
        fetch("/api/templates", { headers }),
        fetch("/api/teams", { headers }),
        fetch("/api/members", { headers }),
      ]);
      if (tRes.ok) {
        const d = await tRes.json();
        setTemplates(d.templates);
      }
      if (teamsRes.ok) {
        const d = await teamsRes.json();
        setTeams(d.teams);
      }
      if (membersRes.ok) {
        const d = await membersRes.json();
        setMembers(d.members);
      }
      setLoading(false);
    };
    run();
  }, [profile?.role]);

  const send = async () => {
    if (!templateId) return;
    setMessage(null);
    setSending(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers,
        body: JSON.stringify({
          templateId,
          audienceType,
          audienceId: audienceType !== "entire_team" ? audienceId || undefined : undefined,
          channel,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const count = data.recipientCount != null ? data.recipientCount : 0;
        setMessage(data.message || `Message logged. ${count} recipients. (Twilio not configured – add credentials to enable sending.)`);
      } else {
        setMessage(data.error || "Failed to send");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
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

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Send Message</h1>
      <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
        SMS and WhatsApp via Twilio. Email via Nodemailer (set SMTP_HOST, SMTP_USER, SMTP_PASS in .env.local for Gmail or any SMTP).
      </p>
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
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Team</label>
              <select
                value={audienceId}
                onChange={(e) => setAudienceId(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              >
                <option value="">Select team</option>
                {teams.map((t) => (
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
            <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Channel</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as typeof channel)}
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
          <button
            type="button"
            onClick={send}
            disabled={sending || !templateId}
            className="w-full rounded-lg bg-amber-600 py-2.5 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send"}
          </button>
          {message && (
            <p className="rounded bg-stone-100 p-2 text-sm text-stone-700 dark:bg-stone-700 dark:text-stone-300">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
