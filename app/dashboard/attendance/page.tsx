"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/api";
import type { Team } from "@/types";
import type { Event } from "@/types";

const TODAY = new Date().toISOString().slice(0, 10);

function getDatesInRange(dateFrom: string, dateTo: string): string[] {
  const from = new Date(dateFrom);
  from.setHours(0, 0, 0, 0);
  const to = new Date(dateTo);
  to.setHours(0, 0, 0, 0);
  const out: string[] = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export default function AttendancePage() {
  const { profile } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [record, setRecord] = useState<{ presentIds: string[]; absentIds: string[] } | null>(null);
  const [choices, setChoices] = useState<{ id: string; present: boolean }[]>([]);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [linkResult, setLinkResult] = useState<{ link: string } | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  const isSuperAdmin = profile?.role === "super_admin";
  const isAdmin = profile?.role === "admin";
  const isMember = profile?.role === "member";
  const canManageAttendance = isSuperAdmin || isAdmin;
  const eventDates = selectedEvent ? getDatesInRange(selectedEvent.dateFrom, selectedEvent.dateTo) : [];
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
          const dates = getDatesInRange(d.event.dateFrom, d.event.dateTo);
          setSelectedDate(dates.includes(TODAY) ? TODAY : dates[0] ?? TODAY);
        }
      })
      .catch(() => setSelectedEvent(null));
  }, [selectedEventId, canManageAttendance]);

  useEffect(() => {
    if (!canManageAttendance || !selectedTeamId || !selectedDate) {
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
        setRecord(d.record ?? null);
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
    setSubmitting(true);
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
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRecord({ presentIds, absentIds });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const generateLink = async () => {
    if (!selectedTeamId || !canManageAttendance) return;
    setGeneratingLink(true);
    setLinkResult(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/attendance/link", {
        method: "POST",
        headers,
        body: JSON.stringify({ teamId: selectedTeamId }),
      });
      const data = await res.json();
      if (res.ok) setLinkResult({ link: data.link });
    } finally {
      setGeneratingLink(false);
    }
  };

  if (!profile) return null;

  // ——— Member: own attendance for today only, location-gated; event-based when events include today ———
  if (isMember) {
    return (
      <MemberAttendanceView
        teams={teams}
        events={events.filter((e) => {
          const from = e.dateFrom.slice(0, 10);
          const to = e.dateTo.slice(0, 10);
          return TODAY >= from && TODAY <= to;
        })}
        myTeamIds={profile?.teamIds ?? []}
      />
    );
  }

  // ——— Super Admin / Admin: team + date dropdowns, mark members ———
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Attendance</h1>

      {canManageAttendance && (
        <div className="mb-8 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800">
          <h2 className="mb-3 font-medium text-stone-900 dark:text-white">Generate secure link (for team leaders)</h2>
          <div className="flex flex-wrap items-end gap-2">
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
            <button
              type="button"
              onClick={generateLink}
              disabled={generatingLink || !selectedTeamId}
              className="rounded bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {generatingLink ? "Generating..." : "Generate link"}
            </button>
          </div>
          {linkResult && (
            <div className="mt-3 rounded bg-stone-100 p-3 text-sm dark:bg-stone-700">
              <p className="mb-1 font-medium text-stone-700 dark:text-stone-300">Link (copy and share):</p>
              <a href={linkResult.link} target="_blank" rel="noopener noreferrer" className="break-all text-amber-600 hover:underline dark:text-amber-400">
                {linkResult.link}
              </a>
            </div>
          )}
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
            <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Date</label>
            {selectedEventId && eventDates.length > 0 ? (
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              >
                {eventDates.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            ) : (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
            )}
          </div>
        </div>
        {loadingRecord && <p className="text-sm text-stone-500">Loading members…</p>}
        {!loadingRecord && selectedTeamId && selectedDate && (
          <>
            {members.length === 0 ? (
              <p className="text-sm text-stone-500">No members in this team.</p>
            ) : (
              <>
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
  myTeamIds,
}: {
  teams: Team[];
  events: Event[];
  myTeamIds: string[];
}) {
  const [venueRequired, setVenueRequired] = useState<boolean | null>(null);
  const [locationOk, setLocationOk] = useState<boolean | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const eventTeamKey = (eventId: string, teamId: string) => `${eventId}:${teamId}`;

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

  const markSelfPresent = async (teamId: string, eventId?: string) => {
    const key = eventId ? eventTeamKey(eventId, teamId) : teamId;
    setSubmitting((s) => ({ ...s, [key]: true }));
    try {
      const headers = await getAuthHeaders();
      const body: { teamId: string; date: string; memberSelf: boolean; eventId?: string; lat?: number; lng?: number } = {
        teamId,
        date: TODAY,
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
        Mark your attendance for today only. You can only mark yourself present for the teams you belong to.
      </p>

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
                    const key = eventTeamKey(ev.id, t.id);
                    return (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-stone-700 dark:text-stone-300">{t.name}</span>
                        {marked[key] ? (
                          <span className="text-sm text-green-600 dark:text-green-400">Marked present</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => markSelfPresent(t.id, ev.id)}
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
