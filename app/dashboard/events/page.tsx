"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/api";
import { getWeekdaysInRange } from "@/lib/default-teams";
import type { Event as EventType } from "@/types";
import type { Team } from "@/types";

export default function EventsPage() {
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

  const isSuperAdmin = profile?.role === "super_admin";

  const fetchEvents = async () => {
    const headers = await getAuthHeaders();
    const res = await fetch("/api/events?upcoming=true&limit=100", { headers });
    if (res.ok) {
      const d = await res.json();
      setEvents(d.events ?? []);
    }
  };

  const fetchAllEvents = async () => {
    const headers = await getAuthHeaders();
    const res = await fetch("/api/events?limit=100", { headers });
    if (res.ok) {
      const d = await res.json();
      setEvents(d.events ?? []);
    }
  };

  useEffect(() => {
    if (!profile) return;
    const run = async () => {
      const headers = await getAuthHeaders();
      const [eventsRes, teamsRes] = await Promise.all([
        fetch("/api/events?limit=50", { headers }),
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
      ? getWeekdaysInRange(new Date(form.dateFrom), new Date(form.dateTo))
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
        const d = await res.json();
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

  if (profile?.role === "member") {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Events</h1>
        <p className="mb-4 text-sm text-stone-600 dark:text-stone-400">View upcoming events and your assignments.</p>
        {loading ? (
          <p className="text-stone-500">Loading events…</p>
        ) : events.length === 0 ? (
          <p className="text-stone-500">No upcoming events.</p>
        ) : (
          <div className="space-y-3">
            {events.map((ev) => (
              <Link
                key={ev.id}
                href={`/dashboard/events/${ev.id}`}
                className="block rounded-xl border border-stone-200 bg-white p-4 transition hover:border-amber-400 dark:border-stone-700 dark:bg-stone-800 dark:hover:border-amber-600"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-medium text-stone-900 dark:text-white">{ev.name}</h3>
                    <p className="text-sm text-stone-500 dark:text-stone-400">
                      {new Date(ev.dateFrom).toLocaleString()} – {new Date(ev.dateTo).toLocaleString()}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

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
                        <input
                          type="checkbox"
                          checked={form.teamIds.includes(t.id)}
                          onChange={() => toggleTeam(t.id)}
                        />
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
                          <input
                            type="checkbox"
                            checked={form.teamIds.includes(t.id)}
                            onChange={() => toggleTeam(t.id)}
                          />
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

      {loading ? (
        <p className="text-stone-500">Loading events…</p>
      ) : events.length === 0 ? (
        <p className="text-stone-500">No events yet. Create one above.</p>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => (
            <Link
              key={ev.id}
              href={`/dashboard/events/${ev.id}`}
              className="block rounded-xl border border-stone-200 bg-white p-4 transition hover:border-amber-400 dark:border-stone-700 dark:bg-stone-800 dark:hover:border-amber-600"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-medium text-stone-900 dark:text-white">{ev.name}</h3>
                  <p className="text-sm text-stone-500 dark:text-stone-400">
                    {new Date(ev.dateFrom).toLocaleString()} – {new Date(ev.dateTo).toLocaleString()}
                  </p>
                </div>
                <span className="text-sm text-stone-400">{ev.teamIds?.length ?? 0} teams</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
