"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/api";
import type { Team, Event as EventType } from "@/types";
import type { Member } from "@/types";

export default function TeamsPage() {
  const { profile } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLeaderId, setEditLeaderId] = useState<string | null>(null);
  const [editLeader2Id, setEditLeader2Id] = useState<string | null>(null);
  const [editMemberIds, setEditMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [teamSort, setTeamSort] = useState<"name-asc" | "name-desc" | "size-desc">("name-asc");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [eventLoading, setEventLoading] = useState(false);
  const [eventForContext, setEventForContext] = useState<EventType & { teams?: { id: string; name: string; leaderId: string | null; leader2Id: string | null; memberIds: string[] }[]; teamOverrides?: EventType["teamOverrides"] } | null>(null);
  type EventTeamRow = { id: string; name: string; leaderId: string | null; leader2Id: string | null; memberIds: string[]; isCustom: boolean };
  const [eventTeams, setEventTeams] = useState<EventTeamRow[]>([]);
  const [editingEventTeamId, setEditingEventTeamId] = useState<string | null>(null);
  const [eventEditMode, setEventEditMode] = useState<"default" | "custom">("default");
  const [eventEditMemberIds, setEventEditMemberIds] = useState<string[]>([]);
  const [eventEditLeaderId, setEventEditLeaderId] = useState<string>("");
  const [eventEditLeader2Id, setEventEditLeader2Id] = useState<string>("");

  const isSuper = profile?.role === "super_admin";

  const getMemberName = (id: string) => members.find((m) => m.id === id)?.name ?? members.find((m) => m.id === id)?.email ?? id;

  const fetchData = async () => {
    const headers = await getAuthHeaders();
    const [teamsRes, membersRes, eventsRes] = await Promise.all([
      fetch("/api/teams", { headers }),
      profile?.role !== "member" ? fetch("/api/members", { headers }) : Promise.resolve(null),
      profile?.role !== "member" ? fetch("/api/events?limit=100", { headers }) : Promise.resolve(null),
    ]);
    if (teamsRes.ok) {
      const d = await teamsRes.json();
      setTeams(d.teams);
    }
    if (membersRes?.ok) {
      const d = await membersRes.json();
      setMembers(d.members);
    }
    if (eventsRes?.ok) {
      const d = await eventsRes.json();
      setEvents(d.events ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (profile?.role === "member") {
      setLoading(false);
      return;
    }
    fetchData();
  }, [profile?.role]);

  const createTeam = async () => {
    if (!newName.trim() || !isSuper) return;
    setCreating(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/teams", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        setNewName("");
        await fetchData();
      }
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (t: Team) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditLeaderId(t.leaderId);
    setEditLeader2Id(t.leader2Id ?? null);
    setEditMemberIds(Array.isArray(t.memberIds) ? t.memberIds : []);
  };

  const saveTeam = async () => {
    if (!editingId) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/teams/${editingId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: editName,
          leaderId: editLeaderId,
          leader2Id: editLeader2Id,
          memberIds: editMemberIds,
        }),
      });
      await fetchData();
      setEditingId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteTeam = async (id: string) => {
    if (!isSuper || !confirm("Delete this team?")) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/teams/${id}`, { method: "DELETE", headers });
      await fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleMember = (memberId: string) => {
    setEditMemberIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const memberSearchLower = memberSearch.trim().toLowerCase();
  const filteredMembersForEdit = memberSearchLower
    ? members.filter((m) => {
        const name = (m.name || `${m.firstName || ""} ${m.lastName || ""}`).toLowerCase();
        const email = (m.email || "").toLowerCase();
        return name.includes(memberSearchLower) || email.includes(memberSearchLower);
      })
    : members;

  const sortedMembersForEdit = [...filteredMembersForEdit].sort((a, b) => {
    const an = (a.name || `${a.firstName || ""} ${a.lastName || ""}`).toLowerCase();
    const bn = (b.name || `${b.firstName || ""} ${b.lastName || ""}`).toLowerCase();
    return an.localeCompare(bn);
  });

  const teamSearchLower = teamSearch.trim().toLowerCase();
  const teamsFiltered = teamSearchLower
    ? teams.filter((t) => {
        const nameMatch = t.name.toLowerCase().includes(teamSearchLower);
        const leaderName = getMemberName(t.leaderId ?? "");
        const leader2Name = getMemberName(t.leader2Id ?? "");
        return nameMatch || leaderName.toLowerCase().includes(teamSearchLower) || leader2Name.toLowerCase().includes(teamSearchLower);
      })
    : teams;

  const sortedTeams = [...teamsFiltered].sort((a, b) => {
    if (teamSort === "size-desc") {
      const as = Array.isArray(a.memberIds) ? a.memberIds.length : 0;
      const bs = Array.isArray(b.memberIds) ? b.memberIds.length : 0;
      if (bs !== as) return bs - as;
      return a.name.localeCompare(b.name);
    }
    if (teamSort === "name-desc") {
      return b.name.localeCompare(a.name);
    }
    return a.name.localeCompare(b.name);
  });

  if (profile?.role === "member") {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-stone-900 dark:text-white">Teams</h1>
        <p className="text-stone-500">You do not have access to this page.</p>
      </div>
    );
  }

  const isSuperAdmin = profile?.role === "super_admin";

  const loadEventContext = async (eventId: string) => {
    if (!eventId) {
      setEventForContext(null);
      setEventTeams([]);
      return;
    }
    setEventLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/events/${eventId}`, { headers });
      if (!res.ok) {
        setEventForContext(null);
        setEventTeams([]);
        return;
      }
      const d = await res.json();
      const ev = d.event as EventType & {
        teams?: { id: string; name: string; leaderId: string | null; leader2Id: string | null; memberIds: string[] }[];
        teamOverrides?: EventType["teamOverrides"];
      };
      setEventForContext(ev);
      const overrides = ev.teamOverrides ?? {};
      const teamsWithFlag =
        ev.teams?.map((t) => ({
          ...t,
          isCustom: !!overrides?.[t.id],
        })) ?? [];
      setEventTeams(teamsWithFlag);
    } catch (e) {
      console.error(e);
      setEventForContext(null);
      setEventTeams([]);
    } finally {
      setEventLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedEventId) {
      setEventForContext(null);
      setEventTeams([]);
      return;
    }
    loadEventContext(selectedEventId);
  }, [selectedEventId]);

  const startEditEventTeam = (teamId: string) => {
    if (!eventForContext) return;
    const baseTeam = teams.find((t) => t.id === teamId);
    const override = eventForContext.teamOverrides?.[teamId];
    const effective = eventTeams.find((t) => t.id === teamId);
    const memberIds =
      override?.memberIds ??
      (effective ? effective.memberIds : baseTeam && Array.isArray(baseTeam.memberIds) ? baseTeam.memberIds : []);
    const leaderId =
      override?.leaderId ??
      (effective ? effective.leaderId : baseTeam?.leaderId ?? "");
    const leader2Id =
      override?.leader2Id ??
      (effective ? effective.leader2Id : baseTeam?.leader2Id ?? "");

    setEditingEventTeamId(teamId);
    setEventEditMemberIds(memberIds ?? []);
    setEventEditLeaderId(leaderId ?? "");
    setEventEditLeader2Id(leader2Id ?? "");
    setEventEditMode(override ? "custom" : "default");
  };

  const saveEventTeamOverride = async () => {
    if (!selectedEventId || !eventForContext || !editingEventTeamId || !isSuperAdmin) return;
    const currentOverrides = eventForContext.teamOverrides ?? {};
    const nextOverrides = { ...currentOverrides };

    if (eventEditMode === "default") {
      delete (nextOverrides as Record<string, unknown>)[editingEventTeamId];
    } else {
      nextOverrides[editingEventTeamId] = {
        memberIds: eventEditMemberIds,
        ...(eventEditLeaderId ? { leaderId: eventEditLeaderId } : {}),
        ...(eventEditLeader2Id ? { leader2Id: eventEditLeader2Id } : {}),
      };
    }

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/events/${selectedEventId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ teamOverrides: nextOverrides }),
      });
      if (res.ok) {
        setEditingEventTeamId(null);
        await loadEventContext(selectedEventId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const cancelEventTeamEdit = () => {
    setEditingEventTeamId(null);
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Teams</h1>
      {isSuper && !selectedEventId && (
        <div className="mb-6 flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New team name"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-white"
          />
          <button
            type="button"
            onClick={createTeam}
            disabled={creating || !newName.trim()}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
          >
            Create team
          </button>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-stone-600 dark:text-stone-300">
          View teams for:
        </label>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-white"
        >
          <option value="">Default teams (no event)</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-stone-500">Loading...</p>
      ) : selectedEventId ? (
        <div className="space-y-4">
          {eventLoading ? (
            <p className="text-stone-500">Loading event teams...</p>
          ) : !eventForContext ? (
            <p className="text-stone-500">Event not found or you do not have access.</p>
          ) : (
            <>
              <p className="text-sm text-stone-600 dark:text-stone-300">
                Editing teams for event:{" "}
                <span className="font-medium text-stone-900 dark:text-white">{eventForContext.name}</span>
              </p>
              <div className="space-y-3">
                {eventTeams.length === 0 ? (
                  <p className="text-stone-500 dark:text-stone-400">
                    No teams are assigned to this event yet. Edit the event to select teams.
                  </p>
                ) : (
                  eventTeams.map((t) => {
                    const baseTeam = teams.find((bt) => bt.id === t.id);
                    const defaultMemberCount = Array.isArray(baseTeam?.memberIds) ? baseTeam!.memberIds.length : 0;
                    const isCustom = t.isCustom;
                    const effectiveCount = t.memberIds.length;
                    const leaderNames: string[] = [];
                    if (t.leaderId) {
                      const m = members.find((x) => x.id === t.leaderId);
                      leaderNames.push(m?.name ?? t.leaderId);
                    }
                    if (t.leader2Id && t.leader2Id !== t.leaderId) {
                      const m2 = members.find((x) => x.id === t.leader2Id);
                      leaderNames.push(m2?.name ?? t.leader2Id);
                    }
                    return (
                      <div
                        key={t.id}
                        className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-stone-900 dark:text-white">{t.name}</p>
                            <p className="text-xs text-stone-500 dark:text-stone-400">
                              {isCustom ? "Customized for this event" : "Using default team roster"}
                            </p>
                          </div>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => startEditEventTeam(t.id)}
                              className="text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
                            >
                              Edit for this event
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-stone-600 dark:text-stone-400">
                          <p className="mb-1">
                            <span className="font-medium">Leads:</span>{" "}
                            {leaderNames.length > 0 ? leaderNames.join(", ") : "None"}
                          </p>
                          <p className="mb-1">
                            <span className="font-medium">Members:</span>{" "}
                            {effectiveCount} member{effectiveCount === 1 ? "" : "s"}
                            {isCustom && defaultMemberCount > 0
                              ? ` (default ${defaultMemberCount})`
                              : defaultMemberCount > 0 && !isCustom
                              ? ` (from default team)`
                              : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="search"
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                placeholder="Search teams or leaders"
                className="rounded border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-800 dark:text-white"
              />
              <p className="text-sm text-stone-500 dark:text-stone-400">
                {sortedTeams.length} team{sortedTeams.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-stone-500 dark:text-stone-400">Sort by</span>
              <select
                value={teamSort}
                onChange={(e) => setTeamSort(e.target.value as typeof teamSort)}
                className="rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800 dark:text-white"
              >
                <option value="name-asc">Name (A–Z)</option>
                <option value="name-desc">Name (Z–A)</option>
                <option value="size-desc">Member count (high → low)</option>
              </select>
            </div>
          </div>
          {sortedTeams.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800"
            >
              {editingId === t.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-medium text-stone-500 dark:text-stone-400">Leader 1</p>
                      <select
                        value={editLeaderId != null ? editLeaderId : ""}
                        onChange={(e) => setEditLeaderId(e.target.value || null)}
                        className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                      >
                        <option value="">—</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-stone-500 dark:text-stone-400">Leader 2 (optional)</p>
                      <select
                        value={editLeader2Id != null ? editLeader2Id : ""}
                        onChange={(e) => setEditLeader2Id(e.target.value || null)}
                        className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                      >
                        <option value="">—</option>
                        {members
                          .filter((m) => m.id !== editLeaderId)
                          .map((m) => (
                            <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                          ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-stone-500 dark:text-stone-400">Members</p>
                      <input
                        type="search"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Search members by name or email..."
                        className="w-40 rounded border border-stone-300 px-2 py-1 text-xs placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                      />
                    </div>
                    <div className="max-h-40 space-y-1 overflow-y-auto">
                      {sortedMembersForEdit.map((m) => (
                        <label key={m.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editMemberIds.includes(m.id)}
                            onChange={() => toggleMember(m.id)}
                          />
                          {m.name} ({m.email})
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveTeam}
                      className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-stone-900 dark:text-white">{t.name}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {(() => {
                        const leaderNames: string[] = [];
                        const l1 = members.find((m) => m.id === t.leaderId);
                        const l2 = t.leader2Id ? members.find((m) => m.id === t.leader2Id) : undefined;
                        if (l1) leaderNames.push(l1.name);
                        if (l2 && (!l1 || l2.id !== l1.id)) leaderNames.push(l2.name);
                        const leadersLabel = leaderNames.length > 0 ? leaderNames.join(", ") : "—";
                        return `Leaders: ${leadersLabel} · ${t.memberIds != null ? t.memberIds.length : 0} members`;
                      })()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(t)}
                      className="text-sm text-amber-600 hover:underline dark:text-amber-400"
                    >
                      Edit
                    </button>
                    {isSuper && (
                      <button
                        type="button"
                        onClick={() => deleteTeam(t.id)}
                        className="text-sm text-red-600 hover:underline dark:text-red-400"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {editingEventTeamId && eventForContext && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-lg dark:bg-stone-800">
            <h2 className="mb-2 text-sm font-semibold text-stone-900 dark:text-white">
              Edit team for event
            </h2>
            <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
              Event: <span className="font-medium">{eventForContext.name}</span>
            </p>
            <div className="mb-3 space-y-2 rounded border border-stone-200 p-2 dark:border-stone-600">
              <p className="mb-1 text-xs font-medium text-stone-700 dark:text-stone-300">
                Roster mode
              </p>
              <div className="flex flex-col gap-1 text-xs text-stone-700 dark:text-stone-300">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={eventEditMode === "default"}
                    onChange={() => setEventEditMode("default")}
                    className="rounded"
                  />
                  <span>Use default team roster</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={eventEditMode === "custom"}
                    onChange={() => setEventEditMode("custom")}
                    className="rounded"
                  />
                  <span>Customize for this event</span>
                </label>
              </div>
            </div>
            {eventEditMode === "custom" && (
              <div className="mb-3 space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-stone-700 dark:text-stone-300">
                    <span>Leader</span>
                    <select
                      value={eventEditLeaderId}
                      onChange={(e) => setEventEditLeaderId(e.target.value)}
                      className="rounded border border-stone-300 px-2 py-1.5 text-xs dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                    >
                      <option value="">Use default</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-stone-700 dark:text-stone-300">
                    <span>Second leader (optional)</span>
                    <select
                      value={eventEditLeader2Id}
                      onChange={(e) => setEventEditLeader2Id(e.target.value)}
                      className="rounded border border-stone-300 px-2 py-1.5 text-xs dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                    >
                      <option value="">Use default</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-stone-700 dark:text-stone-300">
                    Members for this event
                  </p>
                  <div className="max-h-40 space-y-1 overflow-y-auto border border-stone-200 p-2 text-xs dark:border-stone-600">
                    {members.map((m) => (
                      <label key={m.id} className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={eventEditMemberIds.includes(m.id)}
                          onChange={() =>
                            setEventEditMemberIds((prev) =>
                              prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                            )
                          }
                          className="rounded"
                        />
                        <span className="truncate">{m.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelEventTeamEdit}
                className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEventTeamOverride}
                className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
