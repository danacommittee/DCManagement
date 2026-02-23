"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  User,
} from "firebase/auth";
import { auth, isFirebaseConfigured, setAuthPersistence } from "@/lib/firebase";

const LOGIN_AT_KEY = "dcms_login_at";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
import type { Role } from "@/types";

interface MemberProfile {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: Role;
  teamIds: string[];
}

interface AuthState {
  user: User | null;
  profile: MemberProfile | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refetchProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async (firebaseUser: User) => {
    const email = firebaseUser.email ?? null;
    if (!email) return;
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) {
          setProfile(null);
          setError("Your email is not authorized to access this system.");
          return;
        }
        setProfile(null);
        return;
      }
      const data = await res.json();
      setProfile(data.member);
      setError(null);
    } catch {
      setProfile(null);
    }
  };

  const refetchProfile = async () => {
    if (auth.currentUser) await fetchProfile(auth.currentUser);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        if (typeof window !== "undefined") try { localStorage.removeItem(LOGIN_AT_KEY); } catch {}
        setUser(null);
        setProfile(null);
        setError(null);
        setLoading(false);
        return;
      }
      // Enforce 30-day max session: if login was > 30 days ago, sign out
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(LOGIN_AT_KEY);
          const loginAt = raw ? parseInt(raw, 10) : NaN;
          if (!Number.isFinite(loginAt)) {
            localStorage.setItem(LOGIN_AT_KEY, String(Date.now()));
          } else if (Date.now() - loginAt > THIRTY_DAYS_MS) {
            await firebaseSignOut(auth);
            localStorage.removeItem(LOGIN_AT_KEY);
            setUser(null);
            setProfile(null);
            setError(null);
            setLoading(false);
            return;
          }
        } catch {
          // ignore
        }
      }
      setUser(firebaseUser);
      await fetchProfile(firebaseUser);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = async () => {
    setError(null);
    if (!isFirebaseConfigured) {
      setError("App not configured. Check environment variables.");
      return;
    }
    try {
      await setAuthPersistence();
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sign-in failed";
      const code = e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
      if (code === "auth/web-storage-unsupported") {
        setError(
          "Your browser is blocking login (storage is disabled). Please open this link in your device's main browser (Safari/Chrome) instead of an in-app browser."
        );
      } else {
        setError(message);
      }
    }
  };

  const signOut = async () => {
    if (typeof window !== "undefined") try { localStorage.removeItem(LOGIN_AT_KEY); } catch {}
    if (isFirebaseConfigured) await firebaseSignOut(auth);
    setUser(null);
    setProfile(null);
    setError(null);
  };

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    error,
    signInWithGoogle,
    signOut,
    refetchProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
