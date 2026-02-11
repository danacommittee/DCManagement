"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/api";
import { getDatesInRange, today } from "@/lib/dates";
import type { Event as EventType } from "@/types";
import type { Member } from "@/types";

interface EventTeam {
  id: string;
  name: string;
  leaderId: string | null;
  memberIds: string[];
}

interface EventWithTeams extends EventType {
  teams?: EventTeam[];
}

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { profile } = useAuth();
  const [event, setEvent] = useState<EventWithTeams | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [overallStartTime, setOverallStartTime] = useState("");
  const [overallEndTime, setOverallEndTime] = useState("");
  const [savingOverall, setSavingOverall] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", dateFrom: "", dateTo: "", teamIds: [] as string[] });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editMemberIds, setEditMemberIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);

  const isSuperAdmin = profile?.role === "super_admin";
  const eventEndDate = event?.dateTo?.slice(0, 10) ?? "";
  const canSetOverallTime = isSuperAdmin && eventEndDate && eventEndDate <= today();

  const fetchEvent = async () => {
    if (!id) return;
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/events/${id}`, { headers });
    if (res.ok) {
      const d = await res.json();
      const ev = d?.event ?? null;
      setEvent(ev);
      const s = ev?.overallStartTime ?? "";
      const e = ev?.overallEndTime ?? "";
      setOverallStartTime(s ? s.slice(0, 16) : "");
      setOverallEndTime(e ? e.slice(0, 16) : "");
    }
  };

  useEffect(() => {
    if (!id) return;
    const run = async () => {
      const headers = await getAuthHeaders();
      const canEdit = profile?.role === "super_admin";
      const [eventRes, membersRes, teamsRes] = await Promise.all([
        fetch(`/api/events/${id}`, { headers }),
        profile?.role !== "member" ? fetch("/api/members", { headers }) : Promise.resolve(null),
        canEdit ? fetch("/api/teams", { headers }) : Promise.resolve(null),
      ]);
      if (eventRes.ok) {
        const d = await eventRes.json();
        const ev = d?.event ?? null;
        setEvent(ev);
        const s = ev?.overallStartTime ?? "";
        const e = ev?.overallEndTime ?? "";
        setOverallStartTime(s ? s.slice(0, 16) : "");
        setOverallEndTime(e ? e.slice(0, 16) : "");
        if (ev && editing) {
          setEditForm({
            name: ev.name,
            dateFrom: ev.dateFrom.slice(0, 16),
            dateTo: ev.dateTo.slice(0, 16),
            teamIds: ev.teamIds ?? [],
          });
        }
      }
      if (membersRes?.ok) {
        const d = await membersRes.json();
        setMembers(d.members ?? []);
      }
      if (teamsRes?.ok) {
        const d = await teamsRes.json();
        setTeams(d.teams ?? []);
      }
      setLoading(false);
    };
    run();
  }, [id, isSuperAdmin, profile?.role]);

  useEffect(() => {
    if (event && editing) {
      setEditForm({
        name: event.name,
        dateFrom: event.dateFrom.slice(0, 16),
        dateTo: event.dateTo.slice(0, 16),
        teamIds: event.teamIds ?? [],
      });
    }
  }, [event, editing]);

  const saveOverallTime = async () => {
    if (!id || !canSetOverallTime) return;
    setSavingOverall(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          overallStartTime: overallStartTime.trim() || null,
          overallEndTime: overallEndTime.trim() || null,
        }),
      });
      if (res.ok) await fetchEvent();
    } finally {
      setSavingOverall(false);
    }
  };

  const saveEdit = async () => {
    if (!id || !isSuperAdmin) return;
    setSavingEdit(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: editForm.name.trim(),
          dateFrom: editForm.dateFrom,
          dateTo: editForm.dateTo,
          teamIds: editForm.teamIds,
        }),
      });
      if (res.ok) {
        setEditing(false);
        await fetchEvent();
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteEvent = async () => {
    if (!id || !isSuperAdmin || !confirm("Are you sure you want to delete this event?")) return;
    setDeleting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/events/${id}`, { method: "DELETE", headers });
      if (res.ok) router.push("/dashboard/events");
    } finally {
      setDeleting(false);
    }
  };

  const startEditTeam = (team: EventTeam) => {
    setEditingTeamId(team.id);
    setEditMemberIds([...team.memberIds]);
  };

  const saveTeamOverride = async () => {
    if (!id || !editingTeamId || !isSuperAdmin) return;
    const teamOverrides = { ...(event?.teamOverrides ?? {}), [editingTeamId]: { memberIds: editMemberIds } };
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ teamOverrides }),
      });
      if (res.ok) {
        setEditingTeamId(null);
        await fetchEvent();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleTeamMember = (memberId: string) => {
    setEditMemberIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const toggleTeamInEdit = (teamId: string) => {
    setEditForm((f) => ({
      ...f,
      teamIds: f.teamIds.includes(teamId) ? f.teamIds.filter((x) => x !== teamId) : [...f.teamIds, teamId],
    }));
  };

  const eventDates = event ? getDatesInRange(event.dateFrom, event.dateTo) : [];
  const allowedDates = eventDates.filter((d) => d <= today());

  if (loading) return <p className="text-stone-500">Loading…</p>;
  if (!event) return <p className="text-stone-500">Event not found.</p>;

  const myTeamIds = profile?.teamIds ?? [];
  const myTeamsInEvent = event.teams?.filter((t) => t.memberIds.includes(profile?.id ?? "") || t.leaderId === profile?.id) ?? [];

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard/events" className="text-sm text-amber-600 hover:underline dark:text-amber-400">
          ← Back to events
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          {editing && isSuperAdmin ? (
            <div className="space-y-2">
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full max-w-md rounded border border-stone-300 px-3 py-2 text-lg font-semibold dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
              <div className="flex gap-4">
                <input
                  type="datetime-local"
                  value={editForm.dateFrom}
                  onChange={(e) => setEditForm((f) => ({ ...f, dateFrom: e.target.value }))}
                  className="rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                />
                <input
                  type="datetime-local"
                  value={editForm.dateTo}
                  onChange={(e) => setEditForm((f) => ({ ...f, dateTo: e.target.value }))}
                  className="rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {teams.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded border border-stone-200 px-2 py-1 text-sm dark:border-stone-600">
                    <input
                      type="checkbox"
                      checked={editForm.teamIds.includes(t.id)}
                      onChange={() => toggleTeamInEdit(t.id)}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={savingEdit}
                  className="rounded bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {savingEdit ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded border border-stone-300 px-4 py-2 text-sm dark:border-stone-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-stone-900 dark:text-white">{event.name}</h1>
              <p className="mt-1 text-stone-500 dark:text-stone-400">
                {new Date(event.dateFrom).toLocaleString()} – {new Date(event.dateTo).toLocaleString()}
              </p>
            </>
          )}
        </div>
        {isSuperAdmin && !editing && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded border border-stone-300 px-4 py-2 text-sm dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-700"
            >
              Edit event
            </button>
            <button
              type="button"
              onClick={deleteEvent}
              disabled={deleting}
              className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete event"}
            </button>
          </div>
        )}
      </div>

      {canSetOverallTime && !editing && (
        <div className="mb-6 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800">
          <h2 className="mb-3 font-medium text-stone-900 dark:text-white">Overall event time (Super Admin)</h2>
          <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
            Track how long the full event took from start to end.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Start time</label>
              <input
                type="datetime-local"
                value={overallStartTime}
                onChange={(e) => setOverallStartTime(e.target.value)}
                className="rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">End time</label>
              <input
                type="datetime-local"
                value={overallEndTime}
                onChange={(e) => setOverallEndTime(e.target.value)}
                className="rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={saveOverallTime}
              disabled={savingOverall}
              className="rounded bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {savingOverall ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {myTeamsInEvent.length > 0 && !editing && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <h2 className="mb-2 font-medium text-amber-900 dark:text-amber-200">Your assignment(s) for this event</h2>
          <ul className="mb-3 list-inside list-disc text-sm text-amber-800 dark:text-amber-300">
            {myTeamsInEvent.map((t) => (
              <li key={t.id}>{t.name}</li>
            ))}
          </ul>
          {allowedDates.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {allowedDates.map((d) => (
                <Link
                  key={d}
                  href={`/dashboard/attendance?eventId=${id}&date=${d}`}
                  className="inline-block rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
                >
                  Attendance — {d}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-amber-700 dark:text-amber-300">No past dates yet. Attendance opens when the event day has passed.</p>
          )}
        </div>
      )}

      <h2 className="mb-2 font-medium text-stone-900 dark:text-white">Teams in this event</h2>
      <div className="space-y-4">
        {event.teams?.map((t) => (
          <div
            key={t.id}
            className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium text-stone-900 dark:text-white">{t.name}</h3>
              {isSuperAdmin && editingTeamId !== t.id && (
                <button
                  type="button"
                  onClick={() => startEditTeam(t)}
                  className="text-sm text-amber-600 hover:underline dark:text-amber-400"
                >
                  Edit members
                </button>
              )}
            </div>
            {editingTeamId === t.id ? (
              <div className="mt-3">
                <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">Select members for this team in this event:</p>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {members.map((m) => (
                    <label key={m.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editMemberIds.includes(m.id)}
                        onChange={() => toggleTeamMember(m.id)}
                      />
                      {m.name}
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={saveTeamOverride}
                    className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingTeamId(null)}
                    className="rounded border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <ul className="mt-2 list-inside list-disc text-sm text-stone-600 dark:text-stone-400">
                {t.memberIds.length === 0 ? (
                  <li className="text-stone-400">No members assigned</li>
                ) : (
                  t.memberIds.map((mid) => {
                    const m = members.find((x) => x.id === mid);
                    return <li key={mid}>{m?.name ?? mid}</li>;
                  })
                )}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
