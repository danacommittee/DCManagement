"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/api";

interface DashboardStats {
  totalMembers: number;
  totalTeams: number;
  attendanceRate: number | null;
  recentAttendance: { id: string; teamId: string; date: string; submittedBy: string }[];
  recentMessages: { id: string; sentAt: number; recipientCount: number }[];
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/dashboard", { headers });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
      setLoading(false);
    };
    run();
  }, []);

  if (loading || !stats) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-stone-900 dark:text-white">Dashboard</h1>
        <p className="text-stone-500">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">
        Dashboard
      </h1>
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-800">
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">Total Members</p>
          <p className="mt-1 text-2xl font-bold text-stone-900 dark:text-white">{stats.totalMembers}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-800">
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">Sub-teams</p>
          <p className="mt-1 text-2xl font-bold text-stone-900 dark:text-white">{stats.totalTeams}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-800">
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">Attendance Rate</p>
          <p className="mt-1 text-2xl font-bold text-stone-900 dark:text-white">
            {stats.attendanceRate != null ? `${stats.attendanceRate}%` : "—"}
          </p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-800">
          <h2 className="mb-3 font-medium text-stone-900 dark:text-white">Recent Attendance</h2>
          {stats.recentAttendance.length === 0 ? (
            <p className="text-sm text-stone-500">No attendance submitted yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {stats.recentAttendance.map((r) => (
                <li key={r.id} className="flex justify-between text-stone-600 dark:text-stone-300">
                  <span>Team · {r.date}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-800">
          <h2 className="mb-3 font-medium text-stone-900 dark:text-white">Recent Messages</h2>
          {stats.recentMessages.length === 0 ? (
            <p className="text-sm text-stone-500">No messages sent yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {stats.recentMessages.map((m) => (
                <li key={m.id} className="flex justify-between text-stone-600 dark:text-stone-300">
                  <span>{m.recipientCount} recipients</span>
                  <span>{new Date(m.sentAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
