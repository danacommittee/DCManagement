"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/api";
import type { Event as EventType } from "@/types";

interface EventWithTeams extends EventType {
  teams?: { id: string; name: string; leaderId: string | null; memberIds: string[] }[];
}

export default function EventDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { profile } = useAuth();
  const [event, setEvent] = useState<EventWithTeams | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getAuthHeaders()
      .then((headers) => fetch(`/api/events/${id}`, { headers }))
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setEvent(d?.event ?? null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-stone-500">Loading…</p>;
  if (!event) return <p className="text-stone-500">Event not found.</p>;

  const myTeamIds = profile?.teamIds ?? [];
  const myTeamsInEvent = event.teams?.filter((t) => t.memberIds.includes(profile?.id ?? "") || t.leaderId === profile?.id) ?? [];

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard/events" className="text-sm text-amber-600 hover:underline dark:text-amber-400">
          ← Back to events
        </Link>
      </div>
      <h1 className="mb-2 text-2xl font-semibold text-stone-900 dark:text-white">{event.name}</h1>
      <p className="mb-6 text-stone-500 dark:text-stone-400">
        {new Date(event.dateFrom).toLocaleString()} – {new Date(event.dateTo).toLocaleString()}
      </p>

      {myTeamsInEvent.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <h2 className="mb-2 font-medium text-amber-900 dark:text-amber-200">Your assignment(s) for this event</h2>
          <ul className="list-inside list-disc text-sm text-amber-800 dark:text-amber-300">
            {myTeamsInEvent.map((t) => (
              <li key={t.id}>{t.name}</li>
            ))}
          </ul>
          <Link
            href="/dashboard/attendance"
            className="mt-2 inline-block text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
          >
            Mark attendance →
          </Link>
        </div>
      )}

      <h2 className="mb-2 font-medium text-stone-900 dark:text-white">Teams in this event</h2>
      <ul className="space-y-1 text-sm text-stone-600 dark:text-stone-400">
        {event.teams?.map((t) => (
          <li key={t.id}>{t.name}</li>
        ))}
      </ul>
    </div>
  );
}
