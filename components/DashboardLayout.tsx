"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import type { Role } from "@/types";

const navByRole: Record<Role, { label: string; href: string }[]> = {
  super_admin: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Members", href: "/dashboard/members" },
    { label: "Teams", href: "/dashboard/teams" },
    { label: "Templates", href: "/dashboard/templates" },
    { label: "Send Message", href: "/dashboard/messages" },
    { label: "Attendance", href: "/dashboard/attendance" },
    { label: "Reports", href: "/dashboard/reports" },
  ],
  admin: [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Members", href: "/dashboard/members" },
    { label: "Teams", href: "/dashboard/teams" },
    { label: "Templates", href: "/dashboard/templates" },
    { label: "Send Message", href: "/dashboard/messages" },
    { label: "Attendance", href: "/dashboard/attendance" },
    { label: "Reports", href: "/dashboard/reports" },
  ],
  member: [
    { label: "Dashboard", href: "/dashboard" },
  ],
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();

  if (!profile) {
    return null;
  }

  const nav = navByRole[profile.role];

  return (
    <div className="flex min-h-screen bg-stone-50 dark:bg-stone-900">
      <aside className="flex w-56 flex-col border-r border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800">
        <div className="flex h-14 items-center gap-2 border-b border-stone-200 px-4 dark:border-stone-700">
          <Image src="/logo.png" alt="Logo" width={32} height={32} className="rounded" />
          <span className="font-semibold text-stone-900 dark:text-white">DCMS</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                pathname === item.href
                  ? "bg-stone-200 text-stone-900 dark:bg-stone-600 dark:text-white"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-700 dark:hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-stone-200 p-2 dark:border-stone-700">
          <p className="truncate px-3 py-1 text-xs text-stone-500 dark:text-stone-400">
            {profile.email}
          </p>
          <p className="truncate px-3 py-1 text-xs font-medium text-stone-700 dark:text-stone-300">
            {profile.name} · {profile.role.replace("_", " ")}
          </p>
          <button
            type="button"
            onClick={() => signOut().then(() => router.push("/login"))}
            className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-700"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
