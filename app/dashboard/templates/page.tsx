"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAuthHeaders } from "@/lib/api";
import type { Template } from "@/types";

export default function TemplatesPage() {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Template["category"]>("custom");
  const [editingId, setEditingId] = useState<string | null>(null);

  const canEdit = profile?.role === "super_admin" || profile?.role === "admin";

  const fetchTemplates = async () => {
    const headers = await getAuthHeaders();
    const res = await fetch("/api/templates", { headers });
    if (res.ok) {
      const data = await res.json();
      setTemplates(data.templates);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (profile?.role === "member") {
      setLoading(false);
      return;
    }
    fetchTemplates();
  }, [profile?.role]);

  const create = async () => {
    if (!name.trim() || !canEdit) return;
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/templates", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: name.trim(), body, category }),
      });
      setName("");
      setBody("");
      setCategory("custom");
      setShowForm(false);
      await fetchTemplates();
    } catch (e) {
      console.error(e);
    }
  };

  const update = async (id: string, updates: { name?: string; body?: string; category?: Template["category"] }) => {
    if (!canEdit) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/templates/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(updates),
      });
      setEditingId(null);
      await fetchTemplates();
    } catch (e) {
      console.error(e);
    }
  };

  const remove = async (id: string) => {
    if (!canEdit || !confirm("Delete this template?")) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/templates/${id}`, { method: "DELETE", headers });
      await fetchTemplates();
    } catch (e) {
      console.error(e);
    }
  };

  if (profile?.role === "member") {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-stone-900 dark:text-white">Templates</h1>
        <p className="text-stone-500">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-stone-900 dark:text-white">Templates</h1>
      <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
        Use placeholders like {"{{Name}}"}, {"{{Team}}"} in the body. They will be replaced when sending.
      </p>
      {canEdit && (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900"
          >
            {showForm ? "Cancel" : "Add template"}
          </button>
          {showForm && (
            <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Template name"
                className="mb-3 w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Template["category"])}
                className="mb-3 w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="special_event">Special Event</option>
                <option value="custom">Custom</option>
              </select>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Body (use {{Name}}, {{Team}}...)"
                rows={4}
                className="mb-3 w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
              />
              <button
                type="button"
                onClick={create}
                className="rounded bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700"
              >
                Create
              </button>
            </div>
          )}
        </div>
      )}
      {loading ? (
        <p className="text-stone-500">Loading...</p>
      ) : (
        <div className="space-y-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-800"
            >
              {editingId === t.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    defaultValue={t.name}
                    id={`name-${t.id}`}
                    className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                  />
                  <textarea
                    defaultValue={t.body}
                    id={`body-${t.id}`}
                    rows={3}
                    className="w-full rounded border border-stone-300 px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-700 dark:text-white"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const nameEl = document.getElementById(`name-${t.id}`) as HTMLInputElement;
                        const bodyEl = document.getElementById(`body-${t.id}`) as HTMLTextAreaElement;
                        update(t.id, { name: nameEl?.value, body: bodyEl?.value });
                      }}
                      className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white"
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
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-stone-900 dark:text-white">{t.name}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">{t.category}</p>
                    <pre className="mt-2 whitespace-pre-wrap rounded bg-stone-100 p-2 text-sm dark:bg-stone-700">{t.body || "(empty)"}</pre>
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(t.id)}
                        className="text-sm text-amber-600 hover:underline dark:text-amber-400"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(t.id)}
                        className="text-sm text-red-600 hover:underline dark:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
