"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/api";
import { getDatesInRange, today } from "@/lib/dates";
import { getWeekdaysInRange as getWeekdaysInRangeUtil } from "@/lib/default-teams";
import type { Event as EventType } from "@/types";
import type { Team } from "@/types";

function getDatesInRangeFromEvent(ev: EventType): string[] {
  return getDatesInRange(ev.dateFrom, ev.dateTo);
}

export default function EventsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [events, setEvents] = useState<EventType[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    dateFrom: "",
    dateTo: "",
    teamIds: [] as string[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [eventMenu, setEventMenu] = useState<{ event: EventType; date: string; x: number; y: number } | null>(null);

  const isSuperAdmin = profile?.role === "super_admin";
  const isAdmin = profile?.role === "admin";
  const isMember = profile?.role === "member";
  const canManageAttendance = isSuperAdmin || isAdmin;

  const fetchAllEvents = useCallback(async () => {
    const headers = await getAuthHeaders();
    const res = await fetch("/api/events?limit=100", { headers });
    if (res.ok) {
      const d = await res.json();
      setEvents(d.events ?? []);
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    const run = async () => {
      const headers = await getAuthHeaders();
      const [eventsRes, teamsRes] = await Promise.all([
        fetch("/api/events?limit=100", { headers }),
        fetch("/api/teams", { headers }),
      ]);
      if (eventsRes.ok) {
        const d = await eventsRes.json();
        setEvents(d.events ?? []);
      }
      if (teamsRes.ok) {
        const d = await teamsRes.json();
        setTeams(d.teams ?? []);
      }
      setLoading(false);
    };
    run();
  }, [profile?.id]);

  const regularTeams = teams.filter((t) => !t.isWrapUp);
  const wrapUpTeams = teams.filter((t) => t.isWrapUp);
  const weekdaysInRange: number[] =
    form.dateFrom && form.dateTo
      ? getWeekdaysInRangeUtil(new Date(form.dateFrom), new Date(form.dateTo))
      : [];
  const wrapUpTeamsForRange = wrapUpTeams.filter((t) =>
    t.dayOfWeek !== undefined ? weekdaysInRange.includes(t.dayOfWeek) : false
  );

  const toggleTeam = (id: string) => {
    setForm((f) => ({
      ...f,
      teamIds: f.teamIds.includes(id) ? f.teamIds.filter((x) => x !== id) : [...f.teamIds, id],
    }));
  };

  const submitEvent = async () => {
    if (!form.name.trim() || !form.dateFrom || !form.dateTo || !isSuperAdmin) return;
    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/events", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: form.name.trim(),
          dateFrom: form.dateFrom,
          dateTo: form.dateTo,
          teamIds: form.teamIds,
        }),
      });
      if (res.ok) {
        setForm({ name: "", dateFrom: "", dateTo: "", teamIds: [] });
        setShowForm(false);
        await fetchAllEvents();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const seedTeams = async () => {
    if (!isSuperAdmin) return;
    setSeeding(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/teams/seed", { method: "POST", headers });
      if (res.ok) {
        const teamsRes = await fetch("/api/teams", { headers });
        if (teamsRes.ok) {
          const data = await teamsRes.json();
          setTeams(data.teams ?? []);
        }
      }
    } finally {
      setSeeding(false);
    }
  };

  const monthStart = new Date(calendarMonth.year, calendarMonth.month, 1);
  const monthEnd = new Date(calendarMonth.year, calendarMonth.month + 1, 0);
  const startPad = monthStart.getDay();
  const totalDays = monthEnd.getDate();
  const prevMonth = () =>
    setCalendarMonth((m) => (m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 }));
  const nextMonth = () =>
    setCalendarMonth((m) => (m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 }));

  const getEventsForDate = (dateStr: string) => {
    return events.filter((ev) => {
      const dates = getDatesInRangeFromEvent(ev);
      return dates.includes(dateStr);
    });
  };

  const handleEventClick = (e: React.MouseEvent, ev: EventType, dateStr: string) => {
    e.preventDefault();
    e.stopPropagation();
    setEventMenu({ event: ev, date: dateStr, x: e.clientX, y: e.clientY });
  };

  const closeMenu = () => setEventMenu(null);

  useEffect(() => {
    if (!eventMenu) return;
    const onDocClick = () => closeMenu();
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [eventMenu]);

  const goToEventDetail = (ev: EventType) => {
    closeMenu();
    router.push(`/dashboard/events/${ev.id}`);
  };

  const goToAttendance = (ev: EventType, dateStr: string) => {
    closeMenu();
    if (dateStr > today()) return;
    router.push(`/dashboard/attendance?eventId=${ev.id}&date=${dateStr}`);
  };

  const todayStr = today();

  const calendarDays: { dateStr: string | null; isCurrentMonth: boolean }[] = [];
  for (let i = 0; i < startPad; i++) {
    calendarDays.push({ dateStr: null, isCurrentMonth: false });
  }
  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(calendarMonth.year, calendarMonth.month, d);
    calendarDays.push({
      dateStr: date.toISOString().slice(0, 10),
      isCurrentMonth: true,
    });
  }

  const EventCalendar = () => (
    <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-medium text-stone-900 dark:text-white">
          {new Date(calendarMonth.year, calendarMonth.month).toLocaleString("default", { month: "long", year: "numeric" })}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={prevMonth}
            className="rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-700"
          >
            ←
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-700"
          >
            →
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-stone-500 dark:text-stone-400">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {calendarDays.map((cell, i) => {
          if (!cell.dateStr) {
            return <div key={i} className="min-h-[80px] rounded bg-stone-50 dark:bg-stone-900/50" />;
          }
          const dayEvents = getEventsForDate(cell.dateStr);
          const isPast = cell.dateStr <= todayStr;
          const isToday = cell.dateStr === todayStr;
          return (
            <div
              key={i}
              className={`min-h-[80px] rounded border p-1 ${
                isToday ? "border-amber-400 bg-amber-50/50 dark:border-amber-600 dark:bg-amber-950/30" : "border-stone-200 bg-stone-50/50 dark:border-stone-700 dark:bg-stone-900/50"
              }`}
            >
              <div className="text-right text-sm font-medium text-stone-700 dark:text-stone-300">{new Date(cell.dateStr).getDate()}</div>
              <div className="mt-1 space-y-0.5">
                {dayEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={(e) => handleEventClick(e, ev, cell.dateStr!)}
                    className="w-full truncate rounded bg-amber-200 px-1 py-0.5 text-left text-xs font-medium text-amber-900 hover:bg-amber-300 dark:bg-amber-800 dark:text-amber-100 dark:hover:bg-amber-700"
                  >
                    {ev.name}
                  </button>
                ))}
                {dayEvents.length > 3 && <div className="text-xs text-stone-500">+{dayEvents.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
      {eventMenu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-lg border border-stone-200 bg-white py-2 shadow-lg dark:border-stone-700 dark:bg-stone-800"
          style={{ left: eventMenu.x, top: eventMenu.y }}
        >
          <button
            type="button"
            onClick={() => goToEventDetail(eventMenu.event)}
            className="block w-full px-4 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-700"
          >
            Event detail
          </button>
          {canManageAttendance && eventMenu.date <= todayStr && (
            <button
              type="button"
              onClick={() => goToAttendance(eventMenu.event, eventMenu.date)}
              className="block w-full px-4 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-700"
            >
              Attendance ({eventMenu.date})
            </button>
          )}
          {isMember && eventMenu.date <= todayStr && (
            <button
              type="button"
              onClick={() => goToAttendance(eventMenu.event, eventMenu.date)}
              className="block w-full px-4 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-700"
            >
              Mark my attendance ({eventMenu.date})
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (loading) return <p className="text-stone-500">Loading…</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Events</h1>

      {isSuperAdmin && (
        <div className="mb-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            {showForm ? "Cancel" : "Create event"}
          </button>
          {teams.length === 0 && (
            <button
              type="button"
              onClick={seedTeams}
              disabled={seeding}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm dark:border-stone-600 disabled:opacity-50"
            >
              {seeding ? "Seeding…" : "Seed default teams"}
            </button>
          )}
        </div>
      )}

      {showForm && isSuperAdmin && (
        <div className="mb-8 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-800">
          <h2 className="mb-4 font-medium text-stone-900 dark:text-white">New event</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-stone-600 dark:text-stone-400">Event name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                placeholder="e.g. Ramadan 2025"
              />
            </div>
            <div />
            <div>
              <label className="mb-1 block text-sm text-stone-600 dark:text-stone-400">From (date & time)</label>
              <input
                type="datetime-local"
                value={form.dateFrom}
                onChange={(e) => setForm((f) => ({ ...f, dateFrom: e.target.value }))}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-stone-600 dark:text-stone-400">To (date & time)</label>
              <input
                type="datetime-local"
                value={form.dateTo}
                onChange={(e) => setForm((f) => ({ ...f, dateTo: e.target.value }))}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">Select teams for this event</p>
            {teams.length === 0 ? (
              <p className="text-sm text-stone-500">Seed default teams first or add teams from the Teams page.</p>
            ) : (
              <div className="flex flex-wrap gap-4">
                <div>
                  <p className="mb-1 text-xs font-medium text-stone-500 dark:text-stone-400">Regular teams</p>
                  <div className="flex flex-wrap gap-2">
                    {regularTeams.map((t) => (
                      <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded border border-stone-200 px-2 py-1 text-sm dark:border-stone-600">
                        <input type="checkbox" checked={form.teamIds.includes(t.id)} onChange={() => toggleTeam(t.id)} />
                        {t.name}
                      </label>
                    ))}
                  </div>
                </div>
                {wrapUpTeamsForRange.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-stone-500 dark:text-stone-400">Wrap-up (by day in range)</p>
                    <div className="flex flex-wrap gap-2">
                      {wrapUpTeamsForRange.map((t) => (
                        <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded border border-stone-200 px-2 py-1 text-sm dark:border-stone-600">
                          <input type="checkbox" checked={form.teamIds.includes(t.id)} onChange={() => toggleTeam(t.id)} />
                          {t.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={submitEvent}
            disabled={submitting || !form.name.trim() || !form.dateFrom || !form.dateTo}
            className="mt-4 rounded bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create event"}
          </button>
        </div>
      )}

      <EventCalendar />
    </div>
  );
}
