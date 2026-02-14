"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/api";
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
    { date: string; team: string; startTime?: string; endTime?: string; notes?: string; presentCount: number; absentCount: number; present: string[]; absent: string[] }[]
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
      a.download = "attendance-report.csv";
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
        <div className="max-w-md space-y-4 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-800">
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
            className="w-full rounded-lg border border-stone-300 py-2.5 font-medium text-stone-900 hover:bg-stone-100 dark:border-stone-600 dark:text-white dark:hover:bg-stone-700 disabled:opacity-50"
          >
            {reportLoading ? "Loading…" : "View report"}
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={loading}
            className="w-full rounded-lg bg-amber-600 py-2.5 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? "Generating…" : "Download CSV report"}
          </button>
        </div>
      </div>
      <div className="lg:col-span-2">
        {reportError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {reportError}
          </div>
        )}
        {report.length === 0 ? (
          <p className="text-sm text-stone-500">No report loaded yet. Choose filters and click “View report”.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-50 text-left text-stone-600 dark:bg-stone-900/50 dark:text-stone-300">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Start</th>
                  <th className="px-3 py-2">End</th>
                  <th className="px-3 py-2">Notes</th>
                  <th className="px-3 py-2">Present</th>
                  <th className="px-3 py-2">Absent</th>
                </tr>
              </thead>
              <tbody>
                {report.map((r, idx) => (
                  <tr key={`${r.date}-${r.team}-${idx}`} className="border-t border-stone-200 dark:border-stone-700">
                    <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.team}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.startTime || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.endTime || "-"}</td>
                    <td className="px-3 py-2 min-w-[240px]">{r.notes || "-"}</td>
                    <td className="px-3 py-2">{r.presentCount}</td>
                    <td className="px-3 py-2">{r.absentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
