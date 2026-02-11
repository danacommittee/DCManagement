"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import { getAuthHeaders } from "@/lib/api";
import type { Member } from "@/types";
import type { Role } from "@/types";

const TITLES = ["", "Mulla", "Shaikh", "bhai", "bhen"];

export default function MembersPage() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Member>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    title: "",
    firstName: "",
    lastName: "",
    itsNumber: "",
    phone: "",
    email: "",
    role: "member" as Role,
  });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);

  const canManage = profile?.role === "super_admin";

  const fetchMembers = async () => {
    const headers = await getAuthHeaders();
    const res = await fetch("/api/members", { headers });
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (profile?.role === "member") {
      setLoading(false);
      return;
    }
    fetchMembers();
  }, [profile?.role]);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canManage) return;
    setUploadError(null);
    setUploading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not signed in");
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/members/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      await fetchMembers();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const submitAdd = async () => {
    if (!addForm.email.trim()) {
      setAddError("Email is required");
      return;
    }
    setAddError(null);
    setAdding(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/members", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: addForm.title.trim(),
          firstName: addForm.firstName.trim(),
          lastName: addForm.lastName.trim(),
          itsNumber: addForm.itsNumber.trim(),
          phone: addForm.phone.trim(),
          email: addForm.email.trim().toLowerCase(),
          role: addForm.role,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add member");
      setShowAddForm(false);
      setAddForm({ title: "", firstName: "", lastName: "", itsNumber: "", phone: "", email: "", role: "member" });
      await fetchMembers();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (m: Member) => {
    setEditingId(m.id);
    setEditForm({
      title: m.title != null ? m.title : "",
      firstName: m.firstName != null ? m.firstName : "",
      lastName: m.lastName != null ? m.lastName : "",
      itsNumber: m.itsNumber != null ? m.itsNumber : "",
      phone: m.phone != null ? m.phone : "",
      role: m.role,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/members/${editingId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        console.error("Failed to update member", await res.text());
        return;
      }

      // If the current user changed their own role, sign them out so permissions refresh
      if (profile && editingId === profile.id && editForm.role && editForm.role !== profile.role) {
        await signOut();
        router.replace("/login");
        return;
      }

      await fetchMembers();
      setEditingId(null);
      setEditForm({});
    } catch (e) {
      console.error(e);
    }
  };

  const deleteOne = async (id: string) => {
    if (!canManage || !confirm("Delete this member?")) return;
    setDeleting(id);
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/members/${id}`, { method: "DELETE", headers });
      await fetchMembers();
      setSelectedIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(null);
    }
  };

  const deleteSelected = async () => {
    if (!canManage || selectedIds.size === 0 || !confirm(`Delete ${selectedIds.size} selected member(s)?`)) return;
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/members", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      await fetchMembers();
      setSelectedIds(new Set());
    } catch (e) {
      console.error(e);
    }
  };

  const deleteAll = async () => {
    if (!canManage || !deleteAllConfirm) return;
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/members/delete-all", { method: "POST", headers });
      await fetchMembers();
      setSelectedIds(new Set());
      setDeleteAllConfirm(false);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === members.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(members.map((m) => m.id)));
  };

  if (profile?.role === "member") {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-stone-900 dark:text-white">Members</h1>
        <p className="text-stone-500">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Members</h1>

      {canManage && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            {showAddForm ? "Cancel" : "Add member"}
          </button>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={deleteSelected}
              className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
            >
              Delete selected ({selectedIds.size})
            </button>
          )}
          <button
            type="button"
            onClick={() => setDeleteAllConfirm(!deleteAllConfirm)}
            className="rounded-lg border border-red-400 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            {deleteAllConfirm ? "Cancel delete all" : "Delete all members"}
          </button>
          {deleteAllConfirm && (
            <button
              type="button"
              onClick={deleteAll}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Confirm: delete every member
            </button>
          )}
        </div>
      )}

      {canManage && showAddForm && (
        <div className="mb-6 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800">
          <h2 className="mb-3 font-medium text-stone-900 dark:text-white">Add member</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Title</label>
              <select
                value={addForm.title}
                onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              >
                {TITLES.map((t) => (
                  <option key={t || "blank"} value={t}>{t || "—"}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">First name</label>
              <input
                type="text"
                value={addForm.firstName}
                onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))}
                className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Last name</label>
              <input
                type="text"
                value={addForm.lastName}
                onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))}
                className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">ITS Number</label>
              <input
                type="text"
                value={addForm.itsNumber}
                onChange={(e) => setAddForm((f) => ({ ...f, itsNumber: e.target.value }))}
                className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Phone</label>
              <input
                type="text"
                value={addForm.phone}
                onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="e.g. 1 (832) 309-5252"
                className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Email *</label>
              <input
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">Role</label>
              <select
                value={addForm.role}
                onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value as Role }))}
                className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
                <option value="super_admin">super_admin</option>
              </select>
            </div>
          </div>
          {addError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{addError}</p>}
          <button
            type="button"
            onClick={submitAdd}
            disabled={adding}
            className="mt-3 rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add member"}
          </button>
        </div>
      )}

      {canManage && (
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-300">
            Upload CSV: Title, First name, Last name, ITS Number, Phone number, Email, Role
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={onFileChange}
            disabled={uploading}
            className="block w-full max-w-xs text-sm text-stone-600 file:mr-4 file:rounded file:border-0 file:bg-stone-200 file:px-4 file:py-2 file:text-sm file:font-medium file:text-stone-800 dark:file:bg-stone-600 dark:file:text-white"
          />
          {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
          {uploading && <p className="mt-2 text-sm text-stone-500">Uploading...</p>}
        </div>
      )}

      {loading ? (
        <p className="text-stone-500">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800">
          <table className="min-w-full divide-y divide-stone-200 dark:divide-stone-600">
            <thead className="bg-stone-50 dark:bg-stone-700/50">
              <tr>
                {canManage && (
                  <th className="whitespace-nowrap px-3 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={members.length > 0 && selectedIds.size === members.length}
                      onChange={toggleSelectAll}
                      className="rounded border-stone-300"
                    />
                  </th>
                )}
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-stone-500 dark:text-stone-400">Title</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-stone-500 dark:text-stone-400">First name</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-stone-500 dark:text-stone-400">Last name</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-stone-500 dark:text-stone-400">ITS Number</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-stone-500 dark:text-stone-400">Phone</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-stone-500 dark:text-stone-400">Email</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-stone-500 dark:text-stone-400">Role</th>
                {canManage && <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-stone-500 dark:text-stone-400">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-stone-600">
              {members.map((m) => (
                <tr key={m.id} className="text-stone-700 dark:text-stone-300">
                  {canManage && (
                    <td className="whitespace-nowrap px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(m.id)}
                        onChange={() => toggleSelect(m.id)}
                        className="rounded border-stone-300"
                      />
                    </td>
                  )}
                  {editingId === m.id ? (
                    <>
                      <td className="whitespace-nowrap px-4 py-2">
                        <select
                          value={editForm.title != null ? editForm.title : ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                          className="w-full rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                        >
                          {TITLES.map((t) => (
                            <option key={t || "blank"} value={t}>{t || "—"}</option>
                          ))}
                        </select>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <input
                          type="text"
                          value={editForm.firstName != null ? editForm.firstName : ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                          className="w-full rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <input
                          type="text"
                          value={editForm.lastName != null ? editForm.lastName : ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                          className="w-full rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <input
                          type="text"
                          value={editForm.itsNumber != null ? editForm.itsNumber : ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, itsNumber: e.target.value }))}
                          className="w-full rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <input
                          type="text"
                          value={editForm.phone != null ? editForm.phone : ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                          className="w-full rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-stone-500 dark:text-stone-400" title="Email cannot be changed">
                        {m.email}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <select
                          value={editForm.role != null ? editForm.role : "member"}
                          onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as Role }))}
                          className="w-full rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                        >
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                          <option value="super_admin">super_admin</option>
                        </select>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <button type="button" onClick={saveEdit} className="mr-2 text-amber-600 hover:underline dark:text-amber-400">Save</button>
                        <button type="button" onClick={() => { setEditingId(null); setEditForm({}); }} className="text-stone-500 hover:underline">Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{m.title != null ? m.title : ""}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{m.firstName != null ? m.firstName : ""}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{m.lastName != null ? m.lastName : ""}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{m.itsNumber != null ? m.itsNumber : ""}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{m.phone != null ? m.phone : ""}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{m.email}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">{m.role}</td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                          <button type="button" onClick={() => startEdit(m)} className="mr-2 text-amber-600 hover:underline dark:text-amber-400">Edit</button>
                          <button
                            type="button"
                            onClick={() => deleteOne(m.id)}
                            disabled={deleting === m.id}
                            className="text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                          >
                            {deleting === m.id ? "..." : "Delete"}
                          </button>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
