"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { getAuthHeaders } from "@/lib/api";
import { Card, CardHeader } from "@/components/Card";
import { getDatesInRange } from "@/lib/dates";
import { LEFTOVER_CONTAINER_TYPES, leftoverContainerLabel } from "@/lib/leftovers";
import type { Event } from "@/types";
import type { LeftoverContainerType, LeftoverItem } from "@/types";

function weekdayForDate(dateStr: string): string {
  try {
    return new Date(dateStr + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" });
  } catch {
    return "";
  }
}

function newItemId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function LeftoversPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const canAccess = profile?.role === "admin" || profile?.role === "super_admin";

  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [items, setItems] = useState<LeftoverItem[]>([]);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [submittedByName, setSubmittedByName] = useState<string | null>(null);

  const [containerType, setContainerType] = useState<LeftoverContainerType>("full_aluminum_tray");
  const [contents, setContents] = useState("");
  const [count, setCount] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const eventDates = useMemo(() => {
    if (!selectedEvent) return [];
    return getDatesInRange(selectedEvent.dateFrom, selectedEvent.dateTo);
  }, [selectedEvent]);

  useEffect(() => {
    if (!canAccess) return;
    getAuthHeaders()
      .then((headers) => fetch("/api/events?limit=100", { headers }))
      .then((res) => (res.ok ? res.json() : { events: [] }))
      .then((d) => setEvents(d.events ?? []))
      .finally(() => setLoadingEvents(false));
  }, [canAccess]);

  useEffect(() => {
    if (!selectedEventId) {
      setSelectedDate("");
      setItems([]);
      setLastSavedAt(null);
      setSubmittedByName(null);
      return;
    }
    if (eventDates.length > 0 && !selectedDate) {
      setSelectedDate(eventDates[0]);
    }
  }, [selectedEventId, eventDates, selectedDate]);

  useEffect(() => {
    if (!selectedEventId || !selectedDate) {
      setItems([]);
      setLastSavedAt(null);
      setSubmittedByName(null);
      return;
    }

    setLoadingRecord(true);
    const params = new URLSearchParams({ eventId: selectedEventId, date: selectedDate });
    getAuthHeaders()
      .then((headers) => fetch(`/api/leftovers?${params}`, { headers }))
      .then((res) => (res.ok ? res.json() : { record: null }))
      .then((d) => {
        const rec = d.record;
        if (rec && Array.isArray(rec.items)) {
          setItems(rec.items);
          setLastSavedAt(rec.updatedAt ?? null);
          setSubmittedByName(rec.submittedByName ?? null);
        } else {
          setItems([]);
          setLastSavedAt(null);
          setSubmittedByName(null);
        }
      })
      .catch(() => {
        setItems([]);
        setLastSavedAt(null);
        setSubmittedByName(null);
      })
      .finally(() => setLoadingRecord(false));
  }, [selectedEventId, selectedDate]);

  const resetForm = () => {
    setContainerType("full_aluminum_tray");
    setContents("");
    setCount(1);
    setEditingId(null);
  };

  const addOrUpdateItem = () => {
    const trimmed = contents.trim();
    if (!trimmed) {
      toast("Enter what is in the container", "error");
      return;
    }
    if (!Number.isFinite(count) || count < 1) {
      toast("Count must be at least 1", "error");
      return;
    }

    if (editingId) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? { ...item, containerType, contents: trimmed, count: Math.floor(count) }
            : item
        )
      );
      toast("Entry updated");
    } else {
      setItems((prev) => [
        ...prev,
        {
          id: newItemId(),
          containerType,
          contents: trimmed,
          count: Math.floor(count),
        },
      ]);
      toast("Entry added");
    }
    resetForm();
  };

  const startEdit = (item: LeftoverItem) => {
    setEditingId(item.id);
    setContainerType(item.containerType);
    setContents(item.contents);
    setCount(item.count);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (editingId === id) resetForm();
  };

  const saveRecord = async () => {
    if (!selectedEventId || !selectedDate) return;
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/leftovers", {
        method: "POST",
        headers,
        body: JSON.stringify({
          eventId: selectedEventId,
          date: selectedDate,
          items,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || "Failed to save", "error");
        return;
      }
      setLastSavedAt(Date.now());
      setSubmittedByName(profile?.name || profile?.email || null);
      toast(items.length === 0 ? "Saved (no entries for this day)" : `Saved ${items.length} entr${items.length === 1 ? "y" : "ies"}`);
    } catch {
      toast("Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const clearDayRecord = async () => {
    if (!selectedEventId || !selectedDate) return;
    if (!confirm("Delete all saved leftover data for this event day?")) return;
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({ eventId: selectedEventId, date: selectedDate });
      const res = await fetch(`/api/leftovers?${params}`, { method: "DELETE", headers });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Failed to delete", "error");
        return;
      }
      setItems([]);
      setLastSavedAt(null);
      setSubmittedByName(null);
      resetForm();
      toast("Day record deleted");
    } catch {
      toast("Failed to delete", "error");
    }
  };

  if (!canAccess) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-stone-900 dark:text-white">Leftovers</h1>
        <p className="text-stone-500">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-stone-900 dark:text-white">Leftover Entry</h1>
      <p className="mb-6 text-sm text-stone-600 dark:text-stone-400">
        Record leftover containers by event day. Add entries, then save when finished.
      </p>

      <Card className="mb-6">
        <CardHeader>Event & day</CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Event</label>
            <select
              value={selectedEventId}
              onChange={(e) => {
                setSelectedEventId(e.target.value);
                setSelectedDate("");
                resetForm();
              }}
              disabled={loadingEvents}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
            >
              <option value="">Select event</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Day</label>
            <select
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                resetForm();
              }}
              disabled={!selectedEventId || eventDates.length === 0}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
            >
              <option value="">Select day</option>
              {eventDates.map((d) => (
                <option key={d} value={d}>
                  {weekdayForDate(d)} — {d}
                </option>
              ))}
            </select>
          </div>
        </div>
        {selectedEvent && selectedDate && (
          <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
            Recording leftovers for <span className="font-medium text-stone-700 dark:text-stone-300">{selectedEvent.name}</span> on{" "}
            <span className="font-medium text-stone-700 dark:text-stone-300">
              {weekdayForDate(selectedDate)}, {selectedDate}
            </span>
            {lastSavedAt != null && (
              <>
                {" "}
                · Last saved {new Date(lastSavedAt).toLocaleString()}
                {submittedByName ? ` by ${submittedByName}` : ""}
              </>
            )}
          </p>
        )}
      </Card>

      {selectedEventId && selectedDate && (
        <>
          <Card className="mb-6">
            <CardHeader>{editingId ? "Edit entry" : "Add entry"}</CardHeader>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Container</label>
                <select
                  value={containerType}
                  onChange={(e) => setContainerType(e.target.value as LeftoverContainerType)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                >
                  {LEFTOVER_CONTAINER_TYPES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">What&apos;s in it</label>
                <input
                  type="text"
                  value={contents}
                  onChange={(e) => setContents(e.target.value)}
                  placeholder="e.g. Rice, Dal, Salad…"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Count</label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value, 10) || 1)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                />
              </div>
              <div className="flex items-end gap-2 sm:col-span-3">
                <button
                  type="button"
                  onClick={addOrUpdateItem}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                >
                  {editingId ? "Update entry" : "Add entry"}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700"
                  >
                    Cancel edit
                  </button>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <CardHeader className="mb-0">Entries ({items.length})</CardHeader>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveRecord}
                  disabled={saving || loadingRecord}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                {lastSavedAt != null && (
                  <button
                    type="button"
                    onClick={clearDayRecord}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    Delete day record
                  </button>
                )}
              </div>
            </div>

            {loadingRecord ? (
              <p className="text-sm text-stone-500">Loading…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-stone-500">No entries yet. Add containers above, then save.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-stone-200 dark:border-stone-600">
                <table className="min-w-full divide-y divide-stone-200 text-sm dark:divide-stone-600">
                  <thead className="bg-stone-50 dark:bg-stone-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-stone-500 dark:text-stone-400">Container</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-stone-500 dark:text-stone-400">Contents</th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase text-stone-500 dark:text-stone-400">Count</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-stone-500 dark:text-stone-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 dark:divide-stone-600">
                    {items.map((item) => (
                      <tr key={item.id} className="text-stone-700 dark:text-stone-300">
                        <td className="whitespace-nowrap px-4 py-3">{leftoverContainerLabel(item.containerType)}</td>
                        <td className="px-4 py-3">{item.contents}</td>
                        <td className="px-4 py-3 text-center">{item.count}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="mr-3 text-amber-600 hover:underline dark:text-amber-400"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="text-red-600 hover:underline dark:text-red-400"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
