"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/api";
import type { Team } from "@/types";
import type { Member } from "@/types";

export default function TeamsPage() {
  const { profile } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLeaderId, setEditLeaderId] = useState<string | null>(null);
  const [editMemberIds, setEditMemberIds] = useState<string[]>([]);

  const isSuper = profile?.role === "super_admin";

  const fetchData = async () => {
    const headers = await getAuthHeaders();
    const [teamsRes, membersRes] = await Promise.all([
      fetch("/api/teams", { headers }),
      profile?.role !== "member" ? fetch("/api/members", { headers }) : Promise.resolve(null),
    ]);
    if (teamsRes.ok) {
      const d = await teamsRes.json();
      setTeams(d.teams);
    }
    if (membersRes?.ok) {
      const d = await membersRes.json();
      setMembers(d.members);
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

  if (profile?.role === "member") {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-stone-900 dark:text-white">Teams</h1>
        <p className="text-stone-500">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Teams</h1>
      {isSuper && (
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
      {loading ? (
        <p className="text-stone-500">Loading...</p>
      ) : (
        <div className="space-y-4">
          {teams.map((t) => (
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
                  <div>
                    <p className="mb-1 text-xs font-medium text-stone-500 dark:text-stone-400">Leader</p>
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
                    <p className="mb-1 text-xs font-medium text-stone-500 dark:text-stone-400">Members</p>
                    <div className="max-h-40 space-y-1 overflow-y-auto">
                      {members.map((m) => (
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
                      Leader: {members.find((m) => m.id === t.leaderId)?.name != null ? members.find((m) => m.id === t.leaderId)!.name : "—"} · {t.memberIds != null ? t.memberIds.length : 0} members
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
    </div>
  );
}
