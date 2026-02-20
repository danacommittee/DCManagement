"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/api";
import { Card } from "@/components/Card";
import { addDays, today } from "@/lib/dates";
import type { Team } from "@/types";

export default function ReportsPage() {
  const { profile } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [eventId, setEventId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [report, setReport] = useState<
    { date: string; team: string; teamId?: string; eventId?: string; startTime?: string; endTime?: string; notes?: string; presentCount: number; absentCount: number; present: string[]; absent: string[] }[]
  >([]);

  const isAdmin = profile?.role === "admin";
  const isSuperAdmin = profile?.role === "super_admin";

  useEffect(() => {
    if (profile?.role === "member") return;
    getAuthHeaders()
      .then((headers) =>
        Promise.all([
          fetch("/api/teams", { headers }),
          fetch("/api/events?limit=100", { headers }),
        ])
      )
      .then(([teamsRes, eventsRes]) =>
        Promise.all([
          teamsRes.ok ? teamsRes.json() : { teams: [] },
          eventsRes.ok ? eventsRes.json() : { events: [] },
        ])
      )
      .then(([teamsData, eventsData]) => {
        setTeams(Array.isArray(teamsData.teams) ? teamsData.teams : []);
        setEvents(Array.isArray(eventsData.events) ? eventsData.events : []);
      });
  }, [profile?.role]);

  const effectiveFrom = isAdmin && selectedDate ? selectedDate : from;
  const effectiveTo = isAdmin && selectedDate ? selectedDate : to;
  const eventName = eventId ? events.find((e) => e.id === eventId)?.name : null;
  const safeEventSlug = eventName ? eventName.replace(/[^a-zA-Z0-9-_]/g, "-").replace(/-+/g, "-").slice(0, 40) : "all";

  const setDateRangePreset = (preset: "today" | "week" | "month") => {
    const t = today();
    if (preset === "today") {
      setFrom(t);
      setTo(t);
      setSelectedDate(t);
    } else if (preset === "week") {
      setFrom(addDays(t, -6));
      setTo(t);
      setSelectedDate("");
    } else {
      const firstOfMonth = t.slice(0, 8) + "01";
      setFrom(firstOfMonth);
      setTo(t);
      setSelectedDate("");
    }
  };

  const downloadCsv = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      params.set("format", "csv");
      if (eventId) params.set("eventId", eventId);
      if (teamId) params.set("teamId", teamId);
      if (isAdmin && selectedDate) {
        params.set("from", selectedDate);
        params.set("to", selectedDate);
      } else {
        if (from) params.set("from", from);
        if (to) params.set("to", to);
      }
      const res = await fetch(`/api/reports?${params}`, { headers });
      if (!res.ok) throw new Error("Failed to generate report");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fromStr = effectiveFrom || "start";
      const toStr = effectiveTo || "end";
      a.download = `attendance-${safeEventSlug}-${fromStr}-to-${toStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const viewReport = async () => {
    setReportLoading(true);
    setReportError(null);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      params.set("format", "json");
      if (eventId) params.set("eventId", eventId);
      if (teamId) params.set("teamId", teamId);
      if (isAdmin && selectedDate) {
        params.set("from", selectedDate);
        params.set("to", selectedDate);
      } else {
        if (from) params.set("from", from);
        if (to) params.set("to", to);
      }
      const res = await fetch(`/api/reports?${params}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load report");
      setReport(Array.isArray(data.report) ? data.report : []);
    } catch (e) {
      setReport([]);
      setReportError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setReportLoading(false);
    }
  };

  if (profile?.role === "member") {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-stone-900 dark:text-white">Reports</h1>
        <p className="text-stone-500">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Reports</h1>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="max-w-md space-y-4 p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
            Event (optional)
          </label>
          <select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
          >
            <option value="">All events</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
            Team (optional)
          </label>
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        {isAdmin && (
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
              Report by day
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
            />
          </div>
        )}
        {isSuperAdmin && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                Date range
              </label>
              <div className="mb-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDateRangePreset("today")}
                  className="rounded border border-stone-300 px-2 py-1 text-xs font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setDateRangePreset("week")}
                  className="rounded border border-stone-300 px-2 py-1 text-xs font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700"
                >
                  This week
                </button>
                <button
                  type="button"
                  onClick={() => setDateRangePreset("month")}
                  className="rounded border border-stone-300 px-2 py-1 text-xs font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-700"
                >
                  This month
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                From date (optional)
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                To date (optional)
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
            </div>
          </>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={viewReport}
            disabled={reportLoading}
            className="w-full min-h-[44px] rounded-lg border border-stone-300 py-3 font-medium text-stone-900 hover:bg-stone-100 dark:border-stone-600 dark:text-white dark:hover:bg-stone-700 disabled:opacity-50"
          >
            {reportLoading ? "Loading…" : "View report"}
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={loading}
            className="w-full min-h-[44px] rounded-lg bg-amber-600 py-3 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? "Generating…" : "Download CSV report"}
          </button>
        </div>
        </Card>
      <div className="lg:col-span-2">
        {reportError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {reportError}
          </div>
        )}
        {report.length === 0 ? (
          <p className="text-sm text-stone-500">No report loaded yet. Choose filters and click “View report”.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {report.map((r, idx) => {
              const viewHref = r.teamId
                ? `/dashboard/attendance?${new URLSearchParams({ teamId: r.teamId, date: r.date, ...(r.eventId ? { eventId: r.eventId } : {}) }).toString()}`
                : "#";
              return (
                <Card key={`${r.date}-${r.team}-${idx}`} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1 text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-medium text-stone-900 dark:text-white">{r.date}</span>
                      <span className="text-stone-600 dark:text-stone-300">{r.team}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0 text-stone-500 dark:text-stone-400">
                      <span>Start {r.startTime || "—"}</span>
                      <span>End {r.endTime || "—"}</span>
                      <span>{r.presentCount} present, {r.absentCount} absent</span>
                    </div>
                    {r.notes ? (
                      <p className="break-words text-stone-500 dark:text-stone-400">Notes: {r.notes}</p>
                    ) : null}
                  </div>
                  {r.teamId ? (
                    <Link
                      href={viewHref}
                      className="shrink-0 self-start inline-flex min-h-[44px] items-center justify-center rounded bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700"
                    >
                      View
                    </Link>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
