"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  User,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
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
      setUser(firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setError(null);
        setLoading(false);
        return;
      }
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
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    }
  };

  const signOut = async () => {
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
