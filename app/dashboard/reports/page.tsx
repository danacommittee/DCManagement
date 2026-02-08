"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/api";
import type { Team } from "@/types";

export default function ReportsPage() {
  const { profile } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile?.role === "member") return;
    getAuthHeaders().then((headers) =>
      fetch("/api/teams", { headers }).then((res) => {
        if (res.ok) return res.json();
        return { teams: [] };
      }).then((d) => setTeams(Array.isArray(d.teams) ? d.teams : []))
    );
  }, [profile?.role]);

  const downloadCsv = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      params.set("format", "csv");
      if (teamId) params.set("teamId", teamId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
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
      <div className="max-w-md space-y-4 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-800">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Team (optional)</label>
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
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">From date (optional)</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">To date (optional)</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
          />
        </div>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={loading}
          className="w-full rounded-lg bg-amber-600 py-2.5 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {loading ? "Generating..." : "Download CSV report"}
        </button>
      </div>
    </div>
  );
}
