"use client";

import { useState } from "react";
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
    { label: "Teams", href: "/dashboard/teams" },
    { label: "Templates", href: "/dashboard/templates" },
    { label: "Send Message", href: "/dashboard/messages" },
    { label: "Attendance", href: "/dashboard/attendance" },
    { label: "Reports", href: "/dashboard/reports" },
  ],
  member: [{ label: "Attendance", href: "/dashboard/attendance" }],
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex min-h-screen bg-stone-50 dark:bg-stone-900">
      {/* Backdrop on mobile when sidebar open */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={closeSidebar}
        className={`fixed inset-0 z-30 bg-black/50 md:hidden ${sidebarOpen ? "block" : "hidden"}`}
      />

      {/* Sidebar: drawer on mobile, always visible on md+ */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 max-w-[85vw] flex-col border-r border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800 md:static md:z-auto md:w-56 md:max-w-none md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } transition-transform duration-200 ease-out`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-stone-200 px-4 dark:border-stone-700">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="Logo" width={32} height={32} className="rounded" />
            <span className="font-semibold text-stone-900 dark:text-white">DCMS</span>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={closeSidebar}
            className="rounded p-2 text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-700 md:hidden"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-auto p-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeSidebar}
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

      {/* Main: top bar on mobile with menu button */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-4 dark:border-stone-700 dark:bg-stone-800 md:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
            className="rounded p-2 text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded" />
          <span className="font-semibold text-stone-900 dark:text-white">DCMS</span>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
