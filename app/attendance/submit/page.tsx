"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function AttendanceSubmitContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const teamId = searchParams.get("teamId");
  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState<{ id: string; name: string; email?: string }[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [choices, setChoices] = useState<{ id: string; present: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token || !teamId) {
      setError("Invalid link: missing token or team.");
      setLoading(false);
      return;
    }
    fetch(`/api/attendance/submit?token=${encodeURIComponent(token)}&teamId=${encodeURIComponent(teamId)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Invalid or expired link");
        return res.json();
      })
      .then((data) => {
        setTeamName(data.teamName != null ? data.teamName : "Team");
        setMembers(Array.isArray(data.members) ? data.members : []);
        setDate(data.date != null ? data.date : new Date().toISOString().slice(0, 10));
        setChoices((Array.isArray(data.members) ? data.members : []).map((m: { id: string }) => ({ id: m.id, present: true })));
      })
      .catch((e) => setError(e.message || "Invalid or expired link"))
      .finally(() => setLoading(false));
  }, [token, teamId]);

  const toggle = (id: string) => {
    setChoices((prev) => prev.map((c) => (c.id === id ? { ...c, present: !c.present } : c)));
  };

  const submit = async () => {
    if (!token || !teamId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/attendance/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          teamId,
          date,
          presentIds: choices.filter((c) => c.present).map((c) => c.id),
          absentIds: choices.filter((c) => !c.present).map((c) => c.id),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to submit");
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 dark:bg-stone-900">
        <p className="text-stone-600">Loading...</p>
      </div>
    );
  }

  if (error && !teamName) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 p-4 dark:bg-stone-900">
        <p className="text-center text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 p-4 dark:bg-stone-900">
        <div className="rounded-xl border border-stone-200 bg-white p-8 text-center dark:border-stone-700 dark:bg-stone-800">
          <p className="text-lg font-medium text-green-600 dark:text-green-400">Attendance submitted successfully.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 p-4 dark:bg-stone-900">
      <div className="mx-auto max-w-md rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-800">
        <h1 className="mb-2 text-xl font-semibold text-stone-900 dark:text-white">{teamName}</h1>
        <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">Mark attendance</p>
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
          />
        </div>
        <div className="mb-4">
          <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">Present / Absent</p>
          <div className="space-y-2">
            {choices.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={c.present}
                  onChange={() => toggle(c.id)}
                />
                <span className={c.present ? "text-stone-900 dark:text-white" : "text-stone-500 dark:text-stone-400"}>
                  {members.find((m) => m.id === c.id)?.name != null ? members.find((m) => m.id === c.id)!.name : c.id}
                </span>
              </label>
            ))}
          </div>
        </div>
        {error && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="w-full rounded-lg bg-amber-600 py-2.5 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit attendance"}
        </button>
      </div>
    </div>
  );
}

export default function AttendanceSubmitPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-stone-100 dark:bg-stone-900"><p className="text-stone-600">Loading...</p></div>}>
      <AttendanceSubmitContent />
    </Suspense>
  );
}
