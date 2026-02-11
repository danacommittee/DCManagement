"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";

export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.replace("/login");
      return;
    }
    if (profile.role === "member" && pathname !== "/dashboard/attendance" && pathname !== "/dashboard/events" && !pathname.startsWith("/dashboard/events/")) {
      router.replace("/dashboard/attendance");
      return;
    }
    if (profile.role === "admin" && pathname === "/dashboard/members") {
      router.replace("/dashboard");
    }
  }, [user, profile, loading, pathname, router]);

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-stone-600">Loading...</p>
      </div>
    );
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
