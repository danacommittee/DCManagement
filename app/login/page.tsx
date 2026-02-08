"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const { user, profile, loading, signInWithGoogle, error } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user && profile) {
      router.replace("/dashboard");
    }
  }, [user, profile, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 dark:bg-stone-900">
        <p className="text-stone-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-100 px-4 dark:bg-stone-900">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-lg dark:border-stone-700 dark:bg-stone-800">
        <div className="mb-6 flex justify-center">
          <Image
            src="/logo.png"
            alt="Dana Committee"
            width={80}
            height={80}
            className="rounded-lg"
          />
        </div>
        <h1 className="mb-1 text-center text-xl font-semibold text-stone-900 dark:text-white">
          Dana Committee
        </h1>
        <p className="mb-6 text-center text-sm text-stone-500 dark:text-stone-400">
          Management System
        </p>
        {error && (
          <p className="mb-4 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <p className="mb-4 text-center text-xs text-stone-500 dark:text-stone-400">
          Sign in with your authorized Google account. Only pre-registered members can access.
        </p>
        <button
          type="button"
          onClick={() => signInWithGoogle()}
          className="w-full rounded-lg bg-stone-900 py-3 font-medium text-white transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
