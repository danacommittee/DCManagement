"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/api";
import { getDatesInRange, today } from "@/lib/dates";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Event as EventType } from "@/types";
import type { Member } from "@/types";

interface EventTeam {
  id: string;
  name: string;
  leaderId: string | null;
  leader2Id: string | null;
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
  const [dailyTimes, setDailyTimes] = useState<Record<string, { startTime: string; endTime: string }>>({});
  const [savingDailyTimes, setSavingDailyTimes] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", dateFrom: "", dateTo: "", teamIds: [] as string[] });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editMemberIds, setEditMemberIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const isSuperAdmin = profile?.role === "super_admin";
  const canManageAttendance = profile?.role === "admin" || profile?.role === "super_admin";
  const eventStartDate = event?.dateFrom?.slice(0, 10) ?? "";
  // Allow setting overall time once the event has started (today or any past day), but not before it begins.
  const canSetOverallTime = isSuperAdmin && eventStartDate && eventStartDate <= today();

  const fetchEvent = async () => {
    if (!id) return;
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/events/${id}`, { headers });
    if (res.ok) {
      const d = await res.json();
      const ev = d?.event ?? null;
      setEvent(ev);
      if (ev) {
        const dt = ev?.dailyTimes ?? {};
        const eventDates = getDatesInRange(ev.dateFrom, ev.dateTo);
        const allowedDates = eventDates.filter((d) => d <= today());
        const initialized: Record<string, { startTime: string; endTime: string }> = {};
        for (const dateStr of allowedDates) {
          initialized[dateStr] = dt[dateStr] ?? { startTime: "", endTime: "" };
        }
        for (const [dateStr, times] of Object.entries(dt)) {
          if (!initialized[dateStr]) {
            initialized[dateStr] = times as { startTime: string; endTime: string };
          }
        }
        setDailyTimes(initialized);
      } else {
        setDailyTimes({});
      }
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
        if (ev) {
          const dt = ev?.dailyTimes ?? {};
          // Initialize empty entries for all allowed dates so inputs show up
          const eventDates = getDatesInRange(ev.dateFrom, ev.dateTo);
          const allowedDates = eventDates.filter((d) => d <= today());
          const initialized: Record<string, { startTime: string; endTime: string }> = {};
          for (const dateStr of allowedDates) {
            initialized[dateStr] = dt[dateStr] ?? { startTime: "", endTime: "" };
          }
          // Also keep any existing entries for dates outside allowed range (in case event was edited)
          for (const [dateStr, times] of Object.entries(dt)) {
            if (!initialized[dateStr]) {
              initialized[dateStr] = times as { startTime: string; endTime: string };
            }
          }
          setDailyTimes(initialized);
        } else {
          setDailyTimes({});
        }
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

  const saveDailyTimes = async () => {
    if (!id || !canSetOverallTime) return;
    setSavingDailyTimes(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          dailyTimes: dailyTimes,
        }),
      });
      if (res.ok) await fetchEvent();
    } finally {
      setSavingDailyTimes(false);
    }
  };

  const updateDayTime = (date: string, field: "startTime" | "endTime", value: string) => {
    setDailyTimes((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        [field]: value,
      },
    }));
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
    if (!id || !isSuperAdmin) return;
    setShowDeleteConfirm(true);
  };

  const confirmDeleteEvent = async () => {
    if (!id || !isSuperAdmin) return;
    setShowDeleteConfirm(false);
    setDeleting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/events/${id}`, { method: "DELETE", headers });
      if (res.ok) router.push("/dashboard/events");
    } finally {
      setDeleting(false);
    }
  };

  const duplicateEvent = async () => {
    if (!event || !isSuperAdmin) return;
    setDuplicating(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/events", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: `${event.name} (copy)`,
          dateFrom: event.dateFrom,
          dateTo: event.dateTo,
          teamIds: event.teamIds ?? [],
        }),
      });
      const d = await res.json();
      if (res.ok && d.id) router.push(`/dashboard/events/${d.id}`);
    } finally {
      setDuplicating(false);
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
  const isSingleDay = eventDates.length === 1;
  const singleDayDate = isSingleDay ? eventDates[0] : null;

  if (loading) return <p className="text-stone-500">Loading…</p>;
  if (!event) return <p className="text-stone-500">Event not found.</p>;

  const myTeamsInEvent =
    event.teams?.filter((t) => {
      const me = profile?.id ?? "";
      return t.memberIds.includes(me) || t.leaderId === me || t.leader2Id === me;
    }) ?? [];

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
                <div>
                  <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">From (date)</label>
                  <input
                    type="date"
                    value={editForm.dateFrom ? editForm.dateFrom.slice(0, 10) : ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, dateFrom: e.target.value ? e.target.value + "T00:00:00" : "" }))}
                    className="rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">To (date)</label>
                  <input
                    type="date"
                    value={editForm.dateTo ? editForm.dateTo.slice(0, 10) : ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, dateTo: e.target.value ? e.target.value + "T23:59:59" : "" }))}
                    className="rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                  />
                </div>
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
        <div className="flex flex-wrap items-center gap-2">
          {allowedDates.length > 0 && (canManageAttendance || profile?.role === "member") && (
            <Link
              href={`/dashboard/attendance?eventId=${id}&date=${allowedDates.includes(today()) ? today() : allowedDates[0]}`}
              className="rounded border border-amber-500 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-900/40"
            >
              Mark attendance for this event
            </Link>
          )}
          {isSuperAdmin && !editing && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded border border-stone-300 px-4 py-2 text-sm dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-700"
              >
                Edit event
              </button>
              <button
                type="button"
                onClick={duplicateEvent}
                disabled={duplicating}
                className="rounded border border-stone-300 px-4 py-2 text-sm dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-50"
              >
                {duplicating ? "Duplicating…" : "Duplicate event"}
              </button>
              <button
                type="button"
                onClick={deleteEvent}
                disabled={deleting}
                className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete event"}
              </button>
            </>
          )}
        </div>
      </div>

      {canSetOverallTime && !editing && (
        <div className="mb-6 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800">
          <h2 className="mb-3 font-medium text-stone-900 dark:text-white">Event times (Super Admin)</h2>
          <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
            {isSingleDay
              ? "Enter start and end time for this event day."
              : "Enter start and end time for each day (today and past days only)."}
          </p>
          {isSingleDay && singleDayDate ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[120px]">
                <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Start time</label>
                <input
                  type="time"
                  value={dailyTimes[singleDayDate]?.startTime ?? ""}
                  onChange={(e) => updateDayTime(singleDayDate, "startTime", e.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                />
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">End time</label>
                <input
                  type="time"
                  value={dailyTimes[singleDayDate]?.endTime ?? ""}
                  onChange={(e) => updateDayTime(singleDayDate, "endTime", e.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                />
              </div>
              <button
                type="button"
                onClick={saveDailyTimes}
                disabled={savingDailyTimes}
                className="min-h-[44px] rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {savingDailyTimes ? "Saving…" : "Save"}
              </button>
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {allowedDates.map((dateStr) => {
                  const dayData = dailyTimes[dateStr] ?? { startTime: "", endTime: "" };
                  const dateObj = new Date(dateStr + "T00:00:00");
                  const dateLabel = dateObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                  return (
                    <div key={dateStr} className="rounded border border-stone-200 bg-stone-50 p-2.5 dark:border-stone-600 dark:bg-stone-900/30">
                      <h3 className="mb-2 text-xs font-medium text-stone-900 dark:text-white">{dateLabel}</h3>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex-1 min-w-[100px]">
                          <label className="mb-0.5 block text-xs text-stone-500 dark:text-stone-400">Start</label>
                          <input
                            type="time"
                            value={dayData.startTime ?? ""}
                            onChange={(e) => updateDayTime(dateStr, "startTime", e.target.value)}
                            className="w-full rounded border border-stone-300 px-2 py-1.5 text-xs dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                          />
                        </div>
                        <div className="flex-1 min-w-[100px]">
                          <label className="mb-0.5 block text-xs text-stone-500 dark:text-stone-400">End</label>
                          <input
                            type="time"
                            value={dayData.endTime ?? ""}
                            onChange={(e) => updateDayTime(dateStr, "endTime", e.target.value)}
                            className="w-full rounded border border-stone-300 px-2 py-1.5 text-xs dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {allowedDates.length > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={saveDailyTimes}
                    disabled={savingDailyTimes}
                    className="rounded bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {savingDailyTimes ? "Saving…" : "Save all times"}
                  </button>
                </div>
              )}
            </div>
          )}
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {event.teams?.map((t) => (
          <div
            key={t.id}
            className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-800"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-medium text-stone-900 dark:text-white">{t.name}</h3>
              {isSuperAdmin && editingTeamId !== t.id && (
                <button
                  type="button"
                  onClick={() => startEditTeam(t)}
                  className="text-xs text-amber-600 hover:underline dark:text-amber-400"
                >
                  Edit
                </button>
              )}
            </div>
            {editingTeamId === t.id ? (
              <div>
                <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">Select members:</p>
                <div className="max-h-48 space-y-1 overflow-y-auto mb-2">
                  {members.map((m) => (
                    <label key={m.id} className="flex cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={editMemberIds.includes(m.id)}
                        onChange={() => toggleTeamMember(m.id)}
                        className="rounded"
                      />
                      <span className="truncate">{m.name}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveTeamOverride}
                    className="flex-1 rounded bg-amber-600 px-2 py-1.5 text-xs text-white hover:bg-amber-700"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingTeamId(null)}
                    className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-xs dark:border-stone-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-stone-600 dark:text-stone-400">
                {t.memberIds.length === 0 ? (
                  <span className="text-stone-400">No members</span>
                ) : (
                  <div className="line-clamp-3">
                    {t.memberIds.map((mid, idx) => {
                      const m = members.find((x) => x.id === mid);
                      return (
                        <span key={mid}>
                          {m?.name ?? mid}
                          {idx < t.memberIds.length - 1 ? ", " : ""}
                        </span>
                      );
                    })}
                  </div>
                )}
                {t.memberIds.length > 3 && (
                  <div className="mt-1 text-stone-500">+{t.memberIds.length - 3} more</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Event"
        message={`Are you sure you want to delete "${event.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteEvent}
        onCancel={() => setShowDeleteConfirm(false)}
        variant="danger"
      />
    </div>
  );
}
