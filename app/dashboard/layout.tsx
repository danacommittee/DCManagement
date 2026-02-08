"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";

export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.replace("/login");
    }
  }, [user, profile, loading, router]);

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-stone-600">Loading...</p>
      </div>
    );
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
