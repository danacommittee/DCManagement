"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/api";
import { getDatesInRange, today } from "@/lib/dates";
import type { Team } from "@/types";
import type { Event } from "@/types";


export default function AttendancePage() {
  const { profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlEventId = searchParams.get("eventId") ?? "";
  const urlDate = searchParams.get("date") ?? "";
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedDate, setSelectedDate] = useState(today());
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [record, setRecord] = useState<{ presentIds: string[]; absentIds: string[]; startTime?: string; endTime?: string; notes?: string } | null>(null);
  const [choices, setChoices] = useState<{ id: string; present: boolean }[]>([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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

  useEffect(() => {
    if (!profile) return;
    const run = async () => {
      const headers = await getAuthHeaders();
      const [teamsRes, eventsRes] = await Promise.all([
        fetch("/api/teams", { headers }),
        fetch("/api/events?limit=100", { headers }),
      ]);
      if (teamsRes.ok) {
        const d = await teamsRes.json();
        setTeams(Array.isArray(d.teams) ? d.teams : []);
      }
      if (eventsRes?.ok) {
        const d = await eventsRes.json();
        setEvents(d.events ?? []);
      }
      setLoading(false);
    };
    run();
  }, [profile?.id]);

  useEffect(() => {
    if (canManageAttendance && urlEventId) setSelectedEventId(urlEventId);
    if (urlDate && urlDate <= today()) setSelectedDate(urlDate);
  }, [urlEventId, urlDate, canManageAttendance]);

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
          setSelectedDate(dates.includes(today()) ? today() : dates[0] ?? today());
        } else {
          setSelectedDate(today());
        }
      })
      .catch(() => setSelectedEvent(null));
  }, [selectedEventId, canManageAttendance]);

  useEffect(() => {
    if (!canManageAttendance || !selectedTeamId || !selectedDate || selectedDate > today()) {
      setMembers([]);
      setRecord(null);
      setChoices([]);
      return;
    }
    setLoadingRecord(true);
    const params = new URLSearchParams({
      teamId: selectedTeamId,
      date: selectedDate,
      expand: "members",
    });
    if (selectedEventId) params.set("eventId", selectedEventId);
    getAuthHeaders()
      .then((headers) => fetch(`/api/attendance?${params}`, { headers }))
      .then((res) => res.json())
      .then((d) => {
        setMembers(d.members ?? []);
        const rec = d.record ?? null;
        setRecord(rec);
        setStartTime(rec?.startTime ?? "");
        setEndTime(rec?.endTime ?? "");
        setNotes(rec?.notes ?? "");
        if (Array.isArray(d.members)) {
          const presentIds = d.record?.presentIds ?? [];
          setChoices(
            d.members.map((m: { id: string }) => ({
              id: m.id,
              present: presentIds.includes(m.id),
            }))
          );
        } else {
          setChoices([]);
        }
      })
      .catch(() => {
        setMembers([]);
        setRecord(null);
        setChoices([]);
      })
      .finally(() => setLoadingRecord(false));
  }, [canManageAttendance, selectedTeamId, selectedDate, selectedEventId]);

  const submitLeaderAttendance = async () => {
    if (!selectedTeamId || !selectedDate || !profile) return;
    if (selectedDate > today()) return; // Block future dates
    setSubmitting(true);
    setSaveMessage(null);
    try {
      const headers = await getAuthHeaders();
      const presentIds = choices.filter((c) => c.present).map((c) => c.id);
      const absentIds = choices.filter((c) => !c.present).map((c) => c.id);
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...(selectedEventId ? { eventId: selectedEventId } : {}),
          teamId: selectedTeamId,
          date: selectedDate,
          presentIds,
          absentIds,
          startTime: startTime.trim() || undefined,
          endTime: endTime.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (res.ok) {
        setRecord({ presentIds, absentIds, startTime: startTime.trim() || undefined, endTime: endTime.trim() || undefined, notes: notes.trim() || undefined });
        setSaveMessage("Saved.");

        // Reset back to default Attendance page (clears query params too)
        setSelectedEventId("");
        setSelectedTeamId("");
        setSelectedDate(today());
        setMembers([]);
        setChoices([]);
        setRecord(null);
        setStartTime("");
        setEndTime("");
        setNotes("");
        setSelectedEvent(null);
        router.push("/dashboard/attendance");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!profile) return null;

  // ——— Member: calendar-linked or events including today ———
  if (isMember) {
    const todayEvents = events.filter((e) => {
      const from = e.dateFrom.slice(0, 10);
      const to = e.dateTo.slice(0, 10);
      return today() >= from && today() <= to;
    });
    return (
      <MemberAttendanceView
        teams={teams}
        events={todayEvents}
        allEvents={events}
        myTeamIds={profile?.teamIds ?? []}
        urlEventId={urlEventId || undefined}
        urlDate={urlDate && urlDate <= today() ? urlDate : undefined}
      />
    );
  }

  // ——— Super Admin / Admin: team + date dropdowns, mark members ———
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Attendance</h1>

      {saveMessage && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300">
          {saveMessage}
        </div>
      )}

      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800">
        <h2 className="mb-3 font-medium text-stone-900 dark:text-white">
          {isSuperAdmin ? "Manage attendance (by event or ad-hoc)" : "Mark attendance (your teams)"}
        </h2>
        <div className="mb-4 flex flex-wrap gap-4">
          <div>
            <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Event (optional)</label>
            <select
              value={selectedEventId}
              onChange={(e) => {
                setSelectedEventId(e.target.value);
                setSelectedTeamId("");
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
              <div>
                <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Team</label>
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                >
                  <option value="">Select team</option>
                  {teamsForDropdown.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
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
        {!eventNotStarted && loadingRecord && <p className="text-sm text-stone-500">Loading members…</p>}
        {!eventNotStarted && !loadingRecord && selectedTeamId && selectedDate && isDateAllowed && (
          <>
            {members.length === 0 ? (
              <p className="text-sm text-stone-500">No members in this team.</p>
            ) : (
              <>
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Start time (team)</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">End time (team)</label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Notes for this day</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                      placeholder="Optional notes…"
                    />
                  </div>
                </div>
                <p className="mb-2 text-sm text-stone-600 dark:text-stone-400">Mark present/absent</p>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {choices.map((c) => {
                    const name = members.find((m) => m.id === c.id)?.name ?? c.id;
                    return (
                      <label key={c.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={c.present}
                          onChange={() =>
                            setChoices((prev) =>
                              prev.map((p) => (p.id === c.id ? { ...p, present: !p.present } : p))
                            )
                          }
                        />
                        {name}
                      </label>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={submitLeaderAttendance}
                  disabled={submitting}
                  className="mt-4 rounded bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {submitting ? "Saving…" : "Save attendance"}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MemberAttendanceView({
  teams,
  events,
  allEvents,
  myTeamIds,
  urlEventId,
  urlDate,
}: {
  teams: Team[];
  events: Event[];
  allEvents: Event[];
  myTeamIds: string[];
  urlEventId?: string;
  urlDate?: string;
}) {
  const [venueRequired, setVenueRequired] = useState<boolean | null>(null);
  const [locationOk, setLocationOk] = useState<boolean | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const eventTeamKey = (eventId: string, teamId: string, dateStr?: string) =>
    dateStr ? `${eventId}:${teamId}:${dateStr}` : `${eventId}:${teamId}`;

  const focusedEvent = urlEventId && urlDate
    ? allEvents.find((e) => e.id === urlEventId && urlDate >= e.dateFrom.slice(0, 10) && urlDate <= e.dateTo.slice(0, 10))
    : null;
  const focusedEventTeams = focusedEvent ? teams.filter((t) => focusedEvent.teamIds.includes(t.id) && myTeamIds.includes(t.id)) : [];

  useEffect(() => {
    fetch("/api/attendance/venue")
      .then((res) => res.json())
      .then((d) => setVenueRequired(d.required === true))
      .catch(() => setVenueRequired(false));
  }, []);

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
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Attendance</h1>
      <p className="mb-4 text-sm text-stone-600 dark:text-stone-400">
        Mark your attendance for event days. You can only mark yourself present for the teams you belong to. No future dates.
      </p>

      {focusedEvent && urlDate && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="mb-2 font-medium text-amber-900 dark:text-amber-200">{focusedEvent.name} — {urlDate}</p>
          <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">Mark attendance for your team(s) on this day:</p>
          <ul className="space-y-2">
            {focusedEventTeams.map((t) => {
              const key = eventTeamKey(focusedEvent.id, t.id, urlDate);
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-stone-700 dark:text-stone-300">{t.name}</span>
                  {marked[key] ? (
                    <span className="text-sm text-green-600 dark:text-green-400">Marked present</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => markSelfPresent(t.id, focusedEvent.id, urlDate)}
                      disabled={!canMark || submitting[key]}
                      className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {submitting[key] ? "Saving…" : "Mark present"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {focusedEventTeams.length === 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-300">You are not in any team for this event.</p>
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
              className="rounded bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700"
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

      <div className={`space-y-4 ${!canMark ? "pointer-events-none opacity-60" : ""}`}>
        {events.length > 0 ? (
          events.map((ev) => {
            const myTeamsInEvent = teams.filter((t) => ev.teamIds.includes(t.id) && myTeamIds.includes(t.id));
            if (myTeamsInEvent.length === 0) return null;
            return (
              <div key={ev.id} className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800">
                <p className="mb-2 font-medium text-stone-900 dark:text-white">{ev.name}</p>
                <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">Today is within this event. Mark attendance for your team(s):</p>
                <ul className="space-y-2">
                  {myTeamsInEvent.map((t) => {
                    const key = eventTeamKey(ev.id, t.id, today());
                    return (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-stone-700 dark:text-stone-300">{t.name}</span>
                        {marked[key] ? (
                          <span className="text-sm text-green-600 dark:text-green-400">Marked present</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => markSelfPresent(t.id, ev.id, today())}
                            disabled={!canMark || submitting[key]}
                            className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            {submitting[key] ? "Saving…" : "Mark present"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        ) : teams.length === 0 ? (
          <p className="text-sm text-stone-500">You are not in any team yet.</p>
        ) : (
          teams.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800"
            >
              <span className="font-medium text-stone-900 dark:text-white">{t.name}</span>
              {marked[t.id] ? (
                <span className="text-sm text-green-600 dark:text-green-400">Marked present for today</span>
              ) : (
                <button
                  type="button"
                  onClick={() => markSelfPresent(t.id)}
                  disabled={!canMark || submitting[t.id]}
                  className="rounded bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {submitting[t.id] ? "Saving…" : "Mark present today"}
                </button>
              )}
            </div>
          ))
        )}
      </div>
      {!canMark && venueRequired === true && (
        <p className="mt-4 text-sm text-stone-500">Enable location access above to mark attendance.</p>
      )}
    </div>
  );
}
