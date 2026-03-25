"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { getAuthHeaders } from "@/lib/api";
import { Card, CardHeader } from "@/components/Card";
import { addDays, getDatesInRange, today } from "@/lib/dates";
import type { Team } from "@/types";
import type { Event } from "@/types";
import type { Member } from "@/types";


export default function AttendancePage() {
  const { profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlEventId = searchParams.get("eventId") ?? "";
  const urlDate = searchParams.get("date") ?? "";
  const urlTeamId = searchParams.get("teamId") ?? "";
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(today());
  type PerTeamState = {
    members: { id: string; name: string }[];
    record: {
      presentIds: string[];
      absentIds: string[];
      startTime?: string;
      endTime?: string;
      notes?: string;
      submittedBy?: string;
      submittedByName?: string;
    } | null;
    choices: { id: string; present: boolean }[];
    startTime: string;
    endTime: string;
    notes: string;
    loading: boolean;
  };
  const [teamData, setTeamData] = useState<Record<string, PerTeamState>>({});
  const [submittingTeamId, setSubmittingTeamId] = useState<string | null>(null);
  const [copyingTeamId, setCopyingTeamId] = useState<string | null>(null);
  const hasAppliedDefaultTeamsRef = useRef(false);
  const { toast } = useToast();

  const isSuperAdmin = profile?.role === "super_admin";
  const isAdmin = profile?.role === "admin";
  const isMember = profile?.role === "member";
  const canManageAttendance = isSuperAdmin || isAdmin;
  const eventDates = selectedEvent ? getDatesInRange(selectedEvent.dateFrom, selectedEvent.dateTo) : [];
  const allowedDates = eventDates.filter((d) => d <= today());
  const isDateAllowed = selectedDate <= today();
  const eventNotStarted = selectedEvent != null && (selectedEvent.dateFrom?.slice(0, 10) ?? "") > today();
  const teamsInEvent =
    selectedEvent && teams.length > 0
      ? selectedEvent.teamIds.map((tid) => teams.find((t) => t.id === tid)).filter(Boolean) as Team[]
      : [];
  const teamsForDropdown = canManageAttendance ? (selectedEventId ? teamsInEvent : teams) : [];

  const leadTeamIds =
    canManageAttendance && profile?.id && teams.length > 0
      ? teams
          .filter((t) => t.leaderId === profile.id || t.leader2Id === profile.id)
          .map((t) => t.id)
      : [];

  useEffect(() => {
    if (!profile) return;
    const run = async () => {
      const headers = await getAuthHeaders();
      // Members get 403 from /api/members; only leaders need the full member list for attendance
      const fetches = [
        fetch("/api/teams", { headers }),
        fetch("/api/events?limit=100", { headers }),
        ...(canManageAttendance ? [fetch("/api/members", { headers })] : []),
      ];
      const [teamsRes, eventsRes, ...rest] = await Promise.all(fetches);
      if (teamsRes.ok) {
        const d = await teamsRes.json();
        setTeams(Array.isArray(d.teams) ? d.teams : []);
      }
      if (eventsRes?.ok) {
        const d = await eventsRes.json();
        setEvents(d.events ?? []);
      }
      if (canManageAttendance && rest[0]) {
        const membersRes = rest[0] as Response;
        if (membersRes.ok) {
          const d = await membersRes.json();
          setAllMembers(d.members ?? []);
        }
      }
      setLoading(false);
    };
    run();
  }, [profile?.id, canManageAttendance]);

  useEffect(() => {
    if (canManageAttendance && urlEventId) setSelectedEventId(urlEventId);
    if (urlDate && urlDate <= today()) setSelectedDate(urlDate);
    if (canManageAttendance && urlTeamId) setSelectedTeamIds([urlTeamId]);
  }, [urlEventId, urlDate, urlTeamId, canManageAttendance]);

  useEffect(() => {
    if (selectedDate > today()) setSelectedDate(today());
  }, [selectedDate]);

  useEffect(() => {
    if (!selectedEventId || !canManageAttendance) {
      setSelectedEvent(null);
      return;
    }
    getAuthHeaders()
      .then((headers) => fetch(`/api/events/${selectedEventId}`, { headers }))
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        setSelectedEvent(d?.event ?? null);
        if (d?.event?.dateFrom && d?.event?.dateTo) {
          const dates = getDatesInRange(d.event.dateFrom, d.event.dateTo).filter((x) => x <= today());
          const preferredDate = urlDate && dates.includes(urlDate) ? urlDate : (dates.includes(today()) ? today() : dates[0] ?? today());
          setSelectedDate(preferredDate);
        } else {
          setSelectedDate(urlDate && urlDate <= today() ? urlDate : today());
        }
      })
      .catch(() => setSelectedEvent(null));
  }, [selectedEventId, canManageAttendance, urlDate]);

  // Default to lead teams once per page load when no URL params (admin: teams they lead; super_admin: all teams)
  const hasUrlParams = urlTeamId || urlEventId;
  useEffect(() => {
    if (!canManageAttendance || hasUrlParams || teamsForDropdown.length === 0) return;
    if (hasAppliedDefaultTeamsRef.current) return;
    hasAppliedDefaultTeamsRef.current = true;
    const defaultIds =
      isAdmin && leadTeamIds.length > 0
        ? leadTeamIds
        : isSuperAdmin
          ? teamsForDropdown.map((t) => t.id)
          : [];
    setSelectedTeamIds(defaultIds);
  }, [canManageAttendance, isAdmin, isSuperAdmin, teamsForDropdown, leadTeamIds, hasUrlParams]);

  // Fetch attendance for each selected team
  useEffect(() => {
    if (!canManageAttendance || selectedDate > today()) return;
    const toFetch = selectedTeamIds.filter((tid) => {
      const cur = teamData[tid];
      return !cur || cur.loading === false;
    });
    if (toFetch.length === 0) return;

    toFetch.forEach((teamId) => {
      setTeamData((prev) => ({
        ...prev,
        [teamId]: {
          ...prev[teamId],
          members: prev[teamId]?.members ?? [],
          record: prev[teamId]?.record ?? null,
          choices: prev[teamId]?.choices ?? [],
          startTime: prev[teamId]?.startTime ?? "",
          endTime: prev[teamId]?.endTime ?? "",
          notes: prev[teamId]?.notes ?? "",
          loading: true,
        },
      }));
      const params = new URLSearchParams({ teamId, date: selectedDate, expand: "members" });
      if (selectedEventId) params.set("eventId", selectedEventId);
      getAuthHeaders()
        .then((headers) => fetch(`/api/attendance?${params}`, { headers }))
        .then((res) => res.json())
        .then((d) => {
          const members = d.members ?? [];
          const rec = d.record ?? null;
          const presentIds = rec?.presentIds ?? [];
          setTeamData((prev) => ({
            ...prev,
            [teamId]: {
              members,
              record: rec ? {
                ...rec,
                submittedBy: rec.submittedBy,
                submittedByName: rec.submittedByName,
              } : null,
              choices: members.map((m: { id: string }) => ({ id: m.id, present: presentIds.includes(m.id) })),
              startTime: rec?.startTime ?? "",
              endTime: rec?.endTime ?? "",
              notes: rec?.notes ?? "",
              loading: false,
            },
          }));
        })
        .catch(() => {
          setTeamData((prev) => ({
            ...prev,
            [teamId]: {
              members: [],
              record: null,
              choices: [],
              startTime: "",
              endTime: "",
              notes: "",
              loading: false,
            },
          }));
        });
    });
  }, [canManageAttendance, selectedTeamIds, selectedDate, selectedEventId]);

  // Clear teamData for teams no longer selected
  useEffect(() => {
    setTeamData((prev) => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach((tid) => {
        if (!selectedTeamIds.includes(tid)) {
          delete next[tid];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [selectedTeamIds]);

  const updateTeamData = (teamId: string, updater: (prev: PerTeamState) => PerTeamState) => {
    setTeamData((prev) => {
      const cur = prev[teamId];
      if (!cur) return prev;
      return { ...prev, [teamId]: updater(cur) };
    });
  };

  const submitLeaderAttendance = async (teamId: string) => {
    const data = teamData[teamId];
    if (!data || !selectedDate || !profile || selectedDate > today()) return;
    setSubmittingTeamId(teamId);
    try {
      const headers = await getAuthHeaders();
      const presentIds = data.choices.filter((c) => c.present).map((c) => c.id);
      const absentIds = data.choices.filter((c) => !c.present).map((c) => c.id);
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...(selectedEventId ? { eventId: selectedEventId } : {}),
          teamId,
          date: selectedDate,
          presentIds,
          absentIds,
          startTime: data.startTime.trim() || undefined,
          endTime: data.endTime.trim() || undefined,
          notes: data.notes.trim() || undefined,
        }),
      });
      if (res.ok) {
        const record = {
          presentIds,
          absentIds,
          startTime: data.startTime.trim() || undefined,
          endTime: data.endTime.trim() || undefined,
          notes: data.notes.trim() || undefined,
          submittedBy: profile.id,
          submittedByName: profile.name,
        };
        updateTeamData(teamId, (p) => ({ ...p, record }));
        toast("Attendance saved");
      }
    } finally {
      setSubmittingTeamId(null);
    }
  };

  const toggleTeamSelection = (teamId: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  const selectAllTeams = () => {
    setSelectedTeamIds(teamsForDropdown.map((t) => t.id));
  };

  const clearAllTeams = () => {
    setSelectedTeamIds([]);
  };

  const setAllPresent = (teamId: string) => {
    updateTeamData(teamId, (p) => ({
      ...p,
      choices: p.choices.map((c) => ({ ...c, present: true })),
    }));
    toast("All marked present");
  };

  const copyFromPreviousDay = async (teamId: string) => {
    const prevDate = addDays(selectedDate, -1);
    setCopyingTeamId(teamId);
    try {
      const params = new URLSearchParams({ teamId, to: prevDate, expand: "members" });
      if (selectedEventId) params.set("eventId", selectedEventId);
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/attendance?${params}`, { headers });
      const d = await res.json();
      const members = d.members ?? [];
      const rec = d.record ?? null;
      if (!rec || members.length === 0) {
        toast("No previous attendance found to copy");
        return;
      }
      const presentIds = rec.presentIds ?? [];
      updateTeamData(teamId, (p) => ({
        ...p,
        choices: p.members.map((m) => ({ id: m.id, present: presentIds.includes(m.id) })),
        startTime: rec.startTime ?? "",
        endTime: rec.endTime ?? "",
        notes: rec.notes ?? "",
      }));
      toast("Copied from previous day");
    } catch {
      toast("Failed to copy previous attendance");
    } finally {
      setCopyingTeamId(null);
    }
  };

  if (!profile) return null;

  // ——— Member: events started (today or past days) ———
  if (isMember) {
    const startedEvents = events.filter((e) => {
      const from = e.dateFrom.slice(0, 10);
      return today() >= from;
    });
    // Use teams from API as source of truth for "my teams" (API already filters to member's teams by team.memberIds)
    const memberTeamIds = teams.map((t) => t.id);
    return (
      <MemberAttendanceView
        teams={teams}
        events={startedEvents}
        allEvents={events}
        myTeamIds={memberTeamIds}
        myMemberId={profile.id}
        urlEventId={urlEventId || undefined}
        urlDate={urlDate && urlDate <= today() ? urlDate : undefined}
      />
    );
  }

  // ——— Super Admin / Admin: team + date dropdowns, mark members ———
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Attendance</h1>

      <Card>
        <CardHeader>
          {isSuperAdmin ? "Manage attendance (by event or ad-hoc)" : "Mark attendance (your teams)"}
        </CardHeader>
        <div className="sticky top-0 z-10 -mx-4 -mt-2 mb-4 bg-white px-4 py-3 dark:bg-stone-800 md:-mx-6 md:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
          <div>
            <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Event (optional)</label>
            <select
              value={selectedEventId}
              onChange={(e) => {
                setSelectedEventId(e.target.value);
                setSelectedTeamIds([]);
              }}
              className="rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
            >
              <option value="">No event (ad-hoc)</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>
          {!eventNotStarted && (
            <>
              <div className="w-full">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="block text-xs text-stone-500 dark:text-stone-400">Teams</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={selectAllTeams}
                      className="text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={clearAllTeams}
                      className="text-xs font-medium text-stone-500 hover:underline dark:text-stone-400"
                    >
                      Clear all
                    </button>
                  </div>
                </div>
                <div className="max-h-56 overflow-x-hidden overflow-y-auto rounded border border-stone-300 bg-stone-50/50 p-2 dark:border-stone-600 dark:bg-stone-900/30">
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                    {teamsForDropdown.map((t) => (
                      <label
                        key={t.id}
                        className="flex min-h-[44px] min-w-0 cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-stone-100 dark:hover:bg-stone-800"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTeamIds.includes(t.id)}
                          onChange={() => toggleTeamSelection(t.id)}
                          className="shrink-0 rounded border-stone-300"
                        />
                        <span className="min-w-0 break-words text-stone-900 dark:text-white">{t.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                  {selectedTeamIds.length === 0
                    ? "No teams selected"
                    : `${selectedTeamIds.length} team${selectedTeamIds.length !== 1 ? "s" : ""} selected`}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Date (today or past only)</label>
                {selectedEventId && allowedDates.length > 0 ? (
                  <select
                    value={allowedDates.includes(selectedDate) ? selectedDate : allowedDates[0] ?? selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                  >
                    {allowedDates.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="date"
                    value={selectedDate > today() ? today() : selectedDate}
                    max={today()}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v <= today()) setSelectedDate(v);
                    }}
                    className="rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                  />
                )}
              </div>
            </>
          )}
          </div>
        </div>
        {eventNotStarted && (
          <p className="rounded bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            This event has not yet started. Attendance can be recorded once the event start date has been reached.
          </p>
        )}
        {!eventNotStarted && selectedDate > today() && (
          <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            Attendance can only be recorded for today or past dates. Please select a date on or before {today()}.
          </p>
        )}
        {!eventNotStarted && selectedDate && isDateAllowed && selectedTeamIds.length > 0 && (
          <div className="mt-4 space-y-6">
            {selectedTeamIds.map((tid) => {
              const team = teams.find((t) => t.id === tid);
              const data = teamData[tid];
              const loading = data?.loading ?? true;
              const leaderNames =
                team && allMembers.length > 0
                  ? [team.leaderId, team.leader2Id]
                      .filter((id): id is string => typeof id === "string" && id.length > 0)
                      .map((id) => allMembers.find((m) => m.id === id)?.name ?? id)
                  : [];
              return (
                <Card key={tid} className="border-l-4 border-l-amber-500">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-medium text-stone-900 dark:text-white">{team?.name ?? tid}</h3>
                      {leaderNames.length > 0 && (
                        <p className="text-xs text-stone-500 dark:text-stone-400">Leads: {leaderNames.join(", ")}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleTeamSelection(tid)}
                      className="text-xs text-stone-500 hover:underline dark:text-stone-400"
                    >
                      Remove
                    </button>
                  </div>
                  {loading ? (
                    <p className="text-sm text-stone-500">Loading members…</p>
                  ) : !data || data.members.length === 0 ? (
                    <p className="text-sm text-stone-500">No members in this team.</p>
                  ) : (
                    <>
                      <div className="mb-4 grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Start time</label>
                          <input
                            type="time"
                            value={data.startTime}
                            onChange={(e) => updateTeamData(tid, (p) => ({ ...p, startTime: e.target.value }))}
                            className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">End time</label>
                          <input
                            type="time"
                            value={data.endTime}
                            onChange={(e) => updateTeamData(tid, (p) => ({ ...p, endTime: e.target.value }))}
                            className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Notes</label>
                          <textarea
                            value={data.notes}
                            onChange={(e) => updateTeamData(tid, (p) => ({ ...p, notes: e.target.value }))}
                            rows={2}
                            className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                            placeholder="Optional notes…"
                          />
                        </div>
                      </div>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-stone-600 dark:text-stone-400">Mark present/absent</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setAllPresent(tid)}
                            className="text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
                          >
                            All present
                          </button>
                          <button
                            type="button"
                            onClick={() => copyFromPreviousDay(tid)}
                            disabled={copyingTeamId === tid}
                            className="text-xs font-medium text-amber-600 hover:underline disabled:opacity-50 dark:text-amber-400"
                          >
                            {copyingTeamId === tid ? "Copying…" : "Copy from previous day"}
                          </button>
                        </div>
                      </div>
                      <div className="max-h-48 space-y-1 overflow-y-auto">
                        {data.choices.map((c) => {
                          const name = data.members.find((m) => m.id === c.id)?.name ?? c.id;
                          const markedByName = data.record?.submittedByName ?? null;
                          return (
                            <label
                              key={c.id}
                              className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={c.present}
                                onChange={() =>
                                  updateTeamData(tid, (p) => ({
                                    ...p,
                                    choices: p.choices.map((x) =>
                                      x.id === c.id ? { ...x, present: !x.present } : x
                                    ),
                                  }))
                                }
                                className="rounded border-stone-300"
                              />
                              <span>
                                {name}
                                {markedByName && c.present && (
                                  <span className="ml-1 text-xs text-stone-400 dark:text-stone-500">
                                    (marked by {markedByName})
                                  </span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => submitLeaderAttendance(tid)}
                        disabled={submittingTeamId === tid}
                        className="mt-4 min-h-[44px] rounded bg-amber-600 px-4 py-3 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        {submittingTeamId === tid ? "Saving…" : "Save attendance"}
                      </button>
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function MemberAttendanceView({
  teams,
  events,
  allEvents,
  myTeamIds,
  myMemberId,
  urlEventId,
  urlDate,
}: {
  teams: Team[];
  events: Event[];
  allEvents: Event[];
  myTeamIds: string[];
  myMemberId: string;
  urlEventId?: string;
  urlDate?: string;
}) {
  const [venueRequired, setVenueRequired] = useState<boolean | null>(null);
  const [locationOk, setLocationOk] = useState<boolean | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [eventDateById, setEventDateById] = useState<Record<string, string>>({});
  const [pendingEvents, setPendingEvents] = useState<{ eventId: string; eventName: string; dates: string[] }[]>([]);

  const eventTeamKey = (eventId: string, teamId: string, dateStr?: string) =>
    dateStr ? `${eventId}:${teamId}:${dateStr}` : `${eventId}:${teamId}`;

  const weekdayForDate = (dateStr: string): string => {
    try {
      return new Date(dateStr + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" });
    } catch {
      return "";
    }
  };

  // For a given event + team, decide if the current member is in that team for this event,
  // honoring per-event teamOverrides if present; otherwise fall back to base team membership.
  const isInTeamForEvent = (ev: Event, teamId: string): boolean => {
    const team = teams.find((t) => t.id === teamId);
    const overrides = (ev.teamOverrides as Record<string, { memberIds?: string[] }> | undefined) ?? undefined;
    const overrideForTeam = overrides?.[teamId];
    if (overrideForTeam && Array.isArray(overrideForTeam.memberIds)) {
      return overrideForTeam.memberIds.includes(myMemberId);
    }
    return team ? team.memberIds.includes(myMemberId) : false;
  };

  const focusedEvent = urlEventId && urlDate
    ? allEvents.find((e) => e.id === urlEventId && urlDate >= e.dateFrom.slice(0, 10) && urlDate <= e.dateTo.slice(0, 10))
    : null;
  const focusedEventTeams = focusedEvent
    ? teams.filter((t) => focusedEvent.teamIds.includes(t.id) && isInTeamForEvent(focusedEvent, t.id))
    : [];

  // Default each event's selected date to today (if in range) otherwise latest allowed date <= today
  useEffect(() => {
    if (!events || events.length === 0) return;
    setEventDateById((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const ev of events) {
        if (next[ev.id]) continue;
        const allowed = getDatesInRange(ev.dateFrom, ev.dateTo).filter((d) => d <= today());
        if (allowed.length === 0) continue;
        const defaultDate = allowed.includes(today()) ? today() : allowed[allowed.length - 1];
        next[ev.id] = defaultDate;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [events]);

  useEffect(() => {
    fetch("/api/attendance/pending")
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.pendingSelfEvents)) {
          setPendingEvents(d.pendingSelfEvents);
        }
      })
      .catch(() => {
        // ignore
      });
  }, []);

  useEffect(() => {
    fetch("/api/attendance/venue")
      .then((res) => res.json())
      .then((d) => setVenueRequired(d.required === true))
      .catch(() => setVenueRequired(false));
  }, []);

  // When venue requires location, try to get position on load (e.g. after refresh) if permission already granted
  useEffect(() => {
    if (venueRequired !== true || !navigator.geolocation) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!cancelled) {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocationOk(true);
          setLocationError(null);
        }
      },
      () => {
        if (!cancelled) setLocationOk(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
    return () => {
      cancelled = true;
    };
  }, [venueRequired]);

  const requestLocation = () => {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationOk(true);
      },
      () => {
        setLocationOk(false);
        setLocationError("Could not get your location. Please allow location access.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const canMark = venueRequired === false || (venueRequired === true && locationOk === true);

  const markSelfPresent = async (teamId: string, eventId?: string, dateStr?: string) => {
    const d = dateStr ?? today();
    const key = eventId ? eventTeamKey(eventId, teamId, dateStr) : teamId;
    setSubmitting((s) => ({ ...s, [key]: true }));
    try {
      const headers = await getAuthHeaders();
      const body: { teamId: string; date: string; memberSelf: boolean; eventId?: string; lat?: number; lng?: number } = {
        teamId,
        date: d,
        memberSelf: true,
      };
      if (eventId) body.eventId = eventId;
      if (venueRequired && coords) {
        body.lat = coords.lat;
        body.lng = coords.lng;
      }
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setMarked((m) => ({ ...m, [key]: true }));
      } else {
        setLocationError(data.error || "Failed to mark attendance.");
      }
    } finally {
      setSubmitting((s) => ({ ...s, [key]: false }));
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Mark your attendance</h1>
      <p className="mb-4 text-sm text-stone-600 dark:text-stone-400">
        Mark your attendance for event days. You can only mark yourself present for the teams you belong to. No future dates.
      </p>

      {pendingEvents.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <p className="mb-2 font-medium text-amber-900 dark:text-amber-200">
            You have pending attendance to mark
          </p>
          <ul className="space-y-1">
            {pendingEvents.map((ev) => (
              <li key={ev.eventId}>
                <div className="font-medium text-amber-900 dark:text-amber-200">{ev.eventName}</div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {ev.dates.map((d) => (
                    <Link
                      key={d}
                      href={`/dashboard/attendance?eventId=${encodeURIComponent(ev.eventId)}&date=${encodeURIComponent(
                        d
                      )}`}
                      className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-100"
                    >
                      {d}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {focusedEvent && urlDate && (
        <div className="mb-6">
          <p className="mb-1 font-medium text-stone-900 dark:text-white">{focusedEvent.name}</p>
          <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
            Marking for <span className="font-medium text-stone-700 dark:text-stone-300">{weekdayForDate(urlDate)}</span>, {urlDate}
          </p>
          <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">Mark attendance for your team(s) on this day:</p>
          {focusedEventTeams.length === 0 ? (
            <p className="text-sm text-stone-500 dark:text-stone-400">You are not in any team for this event.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {focusedEventTeams.map((t) => {
                const key = eventTeamKey(focusedEvent.id, t.id, urlDate);
                return (
                  <div
                    key={t.id}
                    className="flex flex-col rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-600 dark:bg-stone-800"
                  >
                    <p className="mb-3 font-medium text-stone-900 dark:text-white">{t.name}</p>
                    {marked[key] ? (
                      <p className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                        <span className="inline-block h-2 w-2 rounded-full bg-green-500" aria-hidden />
                        Marked present
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => markSelfPresent(t.id, focusedEvent.id, urlDate)}
                        disabled={!canMark || submitting[key]}
                        className="mt-auto min-h-[44px] w-full rounded-lg bg-amber-600 px-4 py-3 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        {submitting[key] ? "Saving…" : "Mark present"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {venueRequired === true && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-200">Location required</p>
          <p className="mb-3 text-sm text-amber-700 dark:text-amber-300">
            You must be at the venue to mark attendance. Allow location access when prompted.
          </p>
          {locationOk !== true && (
            <button
              type="button"
              onClick={requestLocation}
              className="min-h-[44px] rounded bg-amber-600 px-4 py-3 text-sm font-medium text-white hover:bg-amber-700"
            >
              Allow location &amp; check
            </button>
          )}
          {locationOk === true && (
            <p className="text-sm text-green-700 dark:text-green-400">Location allowed. You can mark attendance below.</p>
          )}
          {locationError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{locationError}</p>
          )}
        </div>
      )}

      {venueRequired === false && (
        <p className="mb-4 text-sm text-stone-500">No location check is configured. You can mark attendance below.</p>
      )}

      <div className="space-y-4">
        {events.length > 0 ? (
          events.map((ev) => {
            const myTeamsInEvent = teams.filter(
              (t) => ev.teamIds.includes(t.id) && isInTeamForEvent(ev, t.id)
            );
            if (myTeamsInEvent.length === 0) return null;
            const allowedDates = getDatesInRange(ev.dateFrom, ev.dateTo).filter((d) => d <= today());
            const selectedDate = eventDateById[ev.id] && allowedDates.includes(eventDateById[ev.id])
              ? eventDateById[ev.id]
              : (allowedDates.includes(today()) ? today() : allowedDates[allowedDates.length - 1]);
            return (
              <Card key={ev.id} className="overflow-hidden">
                <p className="mb-2 font-medium text-stone-900 dark:text-white">{ev.name}</p>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-sm text-stone-500 dark:text-stone-400">Choose a day (today or past) to mark attendance:</p>
                    <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">
                      Marking for <span className="font-medium">{weekdayForDate(selectedDate)}</span>, {selectedDate}
                    </p>
                  </div>
                  <div className="min-w-[220px]">
                    <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Day</label>
                    <select
                      value={selectedDate}
                      onChange={(e) => setEventDateById((p) => ({ ...p, [ev.id]: e.target.value }))}
                      className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                    >
                      {allowedDates.map((d) => (
                        <option key={d} value={d}>
                          {weekdayForDate(d)} — {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {myTeamsInEvent.map((t) => {
                    const key = eventTeamKey(ev.id, t.id, selectedDate);
                    return (
                      <div
                        key={t.id}
                        className="flex flex-col rounded-lg border border-stone-200 bg-stone-50/50 p-4 dark:border-stone-600 dark:bg-stone-800/50"
                      >
                        <p className="mb-3 font-medium text-stone-900 dark:text-white">{t.name}</p>
                        {marked[key] ? (
                          <p className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                            <span className="inline-block h-2 w-2 rounded-full bg-green-500" aria-hidden />
                            Marked present
                          </p>
                        ) : (
                          <button
                            type="button"
                            onClick={() => markSelfPresent(t.id, ev.id, selectedDate)}
                            disabled={!canMark || submitting[key]}
                            className="mt-auto min-h-[44px] w-full rounded-lg bg-amber-600 px-4 py-3 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            {submitting[key] ? "Saving…" : "Mark present"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })
        ) : teams.length === 0 ? (
          <p className="text-sm text-stone-500">You are not in any team yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => (
              <div
                key={t.id}
                className="flex flex-col rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-600 dark:bg-stone-800"
              >
                <p className="mb-3 font-medium text-stone-900 dark:text-white">{t.name}</p>
                {marked[t.id] ? (
                  <p className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-500" aria-hidden />
                    Marked present for today
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => markSelfPresent(t.id)}
                    disabled={!canMark || submitting[t.id]}
                    className="mt-auto min-h-[44px] w-full rounded-lg bg-amber-600 px-4 py-3 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {submitting[t.id] ? "Saving…" : "Mark present today"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {!canMark && venueRequired === true && (
        <p className="mt-4 text-sm text-stone-500">Enable location access above to mark attendance. Your events and teams are listed above; use &quot;Allow location &amp; check&quot; to unlock the buttons.</p>
      )}
    </div>
  );
}
