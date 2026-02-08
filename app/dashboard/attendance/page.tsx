"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/api";
import type { Team } from "@/types";

export default function AttendancePage() {
  const { profile } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [records, setRecords] = useState<{ id: string; teamId: string; date: string; presentIds: string[]; absentIds: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [linkResult, setLinkResult] = useState<{ link: string } | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [submitTeamId, setSubmitTeamId] = useState("");
  const [submitDate, setSubmitDate] = useState(new Date().toISOString().slice(0, 10));
  const [memberChoices, setMemberChoices] = useState<{ id: string; present: boolean }[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const isSuperOrAdmin = profile?.role === "super_admin" || profile?.role === "admin";
  const myLeaderTeams = teams.filter((t) => t.leaderId === profile?.id);

  const fetchTeams = async () => {
    const headers = await getAuthHeaders();
    const res = await fetch("/api/teams", { headers });
    if (res.ok) {
      const d = await res.json();
      setTeams(d.teams);
    }
  };

  const fetchRecords = async () => {
    const headers = await getAuthHeaders();
    const url = selectedTeamId
      ? `/api/attendance?teamId=${encodeURIComponent(selectedTeamId)}`
      : "/api/attendance";
    const res = await fetch(url, { headers });
    if (res.ok) {
      const d = await res.json();
      setRecords(d.records);
    }
  };

  useEffect(() => {
    if (profile?.role === "member") {
      setLoading(false);
      return;
    }
    fetchTeams().then(() => setLoading(false));
  }, [profile?.role]);

  useEffect(() => {
    if (!profile || profile.role === "member") return;
    fetchRecords();
  }, [profile?.id, selectedTeamId]);

  const generateLink = async () => {
    if (!submitTeamId || !isSuperOrAdmin) return;
    setGeneratingLink(true);
    setLinkResult(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/attendance/link", {
        method: "POST",
        headers,
        body: JSON.stringify({ teamId: submitTeamId }),
      });
      const data = await res.json();
      if (res.ok) setLinkResult({ link: data.link });
    } finally {
      setGeneratingLink(false);
    }
  };

  const loadMembersForSubmit = (teamId: string) => {
    const t = teams.find((x) => x.id === teamId);
    if (!t) return;
    setSubmitTeamId(teamId);
    setMembers(t.memberIds.map((id) => ({ id, name: id })));
    setMemberChoices(t.memberIds.map((id) => ({ id, present: true })));
  };

  const submitAttendance = async () => {
    if (!submitTeamId || !profile) return;
    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const presentIds = memberChoices.filter((c) => c.present).map((c) => c.id);
      const absentIds = memberChoices.filter((c) => !c.present).map((c) => c.id);
      await fetch("/api/attendance", {
        method: "POST",
        headers,
        body: JSON.stringify({
          teamId: submitTeamId,
          date: submitDate,
          presentIds,
          absentIds,
        }),
      });
      await fetchRecords();
      setSubmitTeamId("");
    } finally {
      setSubmitting(false);
    }
  };

  if (profile?.role === "member") {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-stone-900 dark:text-white">Attendance</h1>
        <p className="text-stone-500">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Attendance</h1>

      {isSuperOrAdmin && (
        <div className="mb-8 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800">
          <h2 className="mb-3 font-medium text-stone-900 dark:text-white">Generate secure link (for team leaders)</h2>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-stone-500 dark:text-stone-400">Team</label>
              <select
                value={submitTeamId}
                onChange={(e) => setSubmitTeamId(e.target.value)}
                className="rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              >
                <option value="">Select team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={generateLink}
              disabled={generatingLink || !submitTeamId}
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

      {myLeaderTeams.length > 0 && (
        <div className="mb-8 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800">
          <h2 className="mb-3 font-medium text-stone-900 dark:text-white">Submit attendance (your teams)</h2>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {myLeaderTeams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => loadMembersForSubmit(t.id)}
                  className="rounded border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-600"
                >
                  {t.name}
                </button>
              ))}
            </div>
            {submitTeamId && (
              <div className="rounded border border-stone-200 p-3 dark:border-stone-600">
                <p className="mb-2 text-sm font-medium">Date</p>
                <input
                  type="date"
                  value={submitDate}
                  onChange={(e) => setSubmitDate(e.target.value)}
                  className="mb-3 rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                />
                <p className="mb-2 text-sm font-medium">Mark present/absent (member IDs – names load from team)</p>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {memberChoices.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={c.present}
                        onChange={() =>
                          setMemberChoices((prev) =>
                            prev.map((p) => (p.id === c.id ? { ...p, present: !p.present } : p))
                          )
                        }
                      />
                      {c.id}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={submitAttendance}
                  disabled={submitting}
                  className="mt-3 rounded bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800">
        <h2 className="mb-3 font-medium text-stone-900 dark:text-white">Recent attendance</h2>
        <div className="mb-2">
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className="rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        {records.length === 0 ? (
          <p className="text-sm text-stone-500">No records yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {records.map((r) => (
              <li key={r.id} className="flex justify-between text-stone-600 dark:text-stone-300">
                <span>Team {r.teamId} · {r.date}</span>
                <span>Present: {r.presentIds.length}, Absent: {r.absentIds.length}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
