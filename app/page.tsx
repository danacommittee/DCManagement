"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function Home() {
  const { user, profile, loading, error } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user && profile) {
      router.replace("/dashboard");
      return;
    }
    if (user && !profile && !error) return;
    if (user && error) return;
    router.replace("/login");
  }, [user, profile, loading, error, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 dark:bg-stone-900">
        <p className="text-stone-600 dark:text-stone-400">Loading...</p>
      </div>
    );
  }

  if (user && !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-100 p-4 dark:bg-stone-900">
        <Image src="/logo.png" alt="Dana Committee" width={120} height={120} className="rounded-lg" />
        <p className="text-center text-red-600 dark:text-red-400">{error || "You are not authorized to access this system."}</p>
        <p className="text-center text-sm text-stone-600 dark:text-stone-400">Your email must be in the member list. Contact a Super Admin.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 dark:bg-stone-900">
      <p className="text-stone-600 dark:text-stone-400">Redirecting...</p>
    </div>
  );
}
