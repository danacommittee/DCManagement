"use client";

import { useAuth } from "@/context/AuthContext";
import LabelGenerator from "@/components/ashara-label-generator/LabelGenerator";

export default function LabelsPage() {
  const { profile } = useAuth();
  const canAccess = profile?.role === "admin" || profile?.role === "super_admin";

  if (!canAccess) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-stone-900 dark:text-white">Print Labels</h1>
        <p className="text-stone-500">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-stone-900 dark:text-white">Ashara Label Generator</h1>
      <p className="mb-6 text-sm text-stone-600 dark:text-stone-400">
        Select a meal, choose items and quantities, then print Avery-compatible label sheets.
      </p>
      <LabelGenerator />
    </div>
  );
}
