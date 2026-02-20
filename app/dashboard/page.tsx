"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/api";
import { Card, CardHeader, cardLinkClassName } from "@/components/Card";

interface RecentAttendanceItem {
  id: string;
  teamId: string;
  teamName: string;
  date: string;
  submittedBy: string;
  submittedByName?: string;
  presentCount: number;
  absentCount: number;
  eventId?: string;
  eventName?: string;
}

interface RecentMessageItem {
  id: string;
  sentAt: number;
  recipientCount: number;
  templateName: string;
  channels: string[];
  createdBy: string;
  createdByName?: string;
}

interface DashboardStats {
  totalMembers: number;
  totalTeams: number;
  attendanceRate: number | null;
  recentAttendance: RecentAttendanceItem[];
  recentMessages: RecentMessageItem[];
}

interface UpcomingEvent {
  id: string;
  name: string;
  dateFrom: string;
  dateTo: string;
  teamIds: string[];
}

function DashboardSkeleton() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Dashboard</h1>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <div className="h-4 w-24 animate-pulse rounded bg-stone-200 dark:bg-stone-600" />
            <div className="mt-2 h-8 w-16 animate-pulse rounded bg-stone-200 dark:bg-stone-600" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <div className="mb-3 h-5 w-40 animate-pulse rounded bg-stone-200 dark:bg-stone-600" />
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-stone-100 dark:bg-stone-700" />
            ))}
          </div>
        </Card>
        <Card>
          <div className="mb-3 h-5 w-36 animate-pulse rounded bg-stone-200 dark:bg-stone-600" />
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-stone-100 dark:bg-stone-700" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.role === "member") {
      router.replace("/dashboard/attendance");
      return;
    }
  }, [profile?.role, router]);

  useEffect(() => {
    if (profile?.role === "member") return;
    const run = async () => {
      const headers = await getAuthHeaders();
      const [dashboardRes, eventsRes] = await Promise.all([
        fetch("/api/dashboard", { headers }),
        fetch("/api/events?upcoming=true&limit=5", { headers }),
      ]);
      if (dashboardRes.ok) {
        const data = await dashboardRes.json();
        setStats(data);
      }
      if (eventsRes.ok) {
        const d = await eventsRes.json();
        setUpcomingEvents(d.events ?? []);
      }
      setLoading(false);
    };
    run();
  }, [profile?.role]);

  if (profile?.role === "member") return null;
  if (loading || !stats) {
    return <DashboardSkeleton />;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Dashboard</h1>

      {upcomingEvents.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 font-medium text-stone-900 dark:text-white">Upcoming events</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingEvents.map((ev) => (
              <Link
                key={ev.id}
                href={`/dashboard/events/${ev.id}`}
                className={cardLinkClassName}
              >
                <p className="font-medium text-stone-900 dark:text-white">{ev.name}</p>
                <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                  {new Date(ev.dateFrom).toLocaleString()} – {new Date(ev.dateTo).toLocaleString()}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">Total Members</p>
          <p className="mt-1 text-2xl font-bold text-stone-900 dark:text-white">{stats.totalMembers}</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">Sub-teams</p>
          <p className="mt-1 text-2xl font-bold text-stone-900 dark:text-white">{stats.totalTeams}</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">Attendance Rate</p>
          <p className="mt-1 text-2xl font-bold text-stone-900 dark:text-white">
            {stats.attendanceRate != null ? `${stats.attendanceRate}%` : "—"}
          </p>
        </Card>
      </div>

      <div className="mb-6">
        <Link
          href="/dashboard/reports"
          className="inline-flex min-h-[44px] items-center rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-700 shadow-sm transition hover:border-amber-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:border-amber-600"
        >
          View attendance report →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>Recent Attendance</CardHeader>
          {stats.recentAttendance.length === 0 ? (
            <div className="space-y-2 text-sm text-stone-500 dark:text-stone-400">
              <p>No attendance submitted yet. Record attendance from the Attendance page.</p>
              <Link
                href="/dashboard/attendance"
                className="inline-block min-h-[44px] py-3 font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
              >
                Go to Attendance →
              </Link>
            </div>
          ) : (
            <ul className="space-y-0 text-sm">
              {stats.recentAttendance.map((r) => {
                const params = new URLSearchParams({ teamId: r.teamId, date: r.date });
                if (r.eventId) params.set("eventId", r.eventId);
                const href = `/dashboard/attendance?${params.toString()}`;
                return (
                  <li key={r.id}>
                    <Link
                      href={href}
                      className="flex min-h-[44px] flex-col justify-center border-b border-stone-100 py-3 last:border-0 dark:border-stone-700"
                    >
                      <span className="font-medium text-stone-900 dark:text-white">
                        {r.teamName} · {r.date}
                      </span>
                      <span className="text-stone-500 dark:text-stone-400">
                        {r.presentCount} present, {r.absentCount} absent
                        {r.submittedByName ? ` · by ${r.submittedByName}` : ""}
                        {r.eventName ? ` · ${r.eventName}` : ""}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>Recent Messages</CardHeader>
          {stats.recentMessages.length === 0 ? (
            <div className="space-y-2 text-sm text-stone-500 dark:text-stone-400">
              <p>No messages sent yet. Send a message from Send Message.</p>
              <Link
                href="/dashboard/messages"
                className="inline-block min-h-[44px] py-3 font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
              >
                Go to Send Message →
              </Link>
            </div>
          ) : (
            <ul className="space-y-0 text-sm">
              {stats.recentMessages.map((m) => {
                const channelsLabel = Array.isArray(m.channels) && m.channels.length > 0
                  ? m.channels.join(", ")
                  : "—";
                return (
                  <li key={m.id}>
                    <Link
                      href="/dashboard/messages"
                      className="flex min-h-[44px] flex-col justify-center border-b border-stone-100 py-3 last:border-0 dark:border-stone-700"
                    >
                      <span className="font-medium text-stone-900 dark:text-white">
                        {m.templateName} · {new Date(m.sentAt).toLocaleString()}
                      </span>
                      <span className="text-stone-500 dark:text-stone-400">
                        {channelsLabel} · {m.recipientCount} recipients
                        {m.createdByName ? ` · by ${m.createdByName}` : ""}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
