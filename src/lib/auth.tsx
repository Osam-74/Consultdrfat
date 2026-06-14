"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { auth, PRACTITIONER_UID } from "./firebase";
import { Role } from "./types";

interface AuthState {
  user: User | null;
  role: Role | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null, role: null, loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // auth is a no-op stub during SSR; onAuthStateChanged is only called
    // after hydration when the real Firebase app is available.
    if (!auth || typeof auth.onAuthStateChanged !== "function") {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const role: Role | null = user
    ? user.uid === PRACTITIONER_UID ? "practitioner" : "client"
    : null;

  const signIn = async () => {
    if (!auth || typeof auth.onAuthStateChanged !== "function") return;
    await signInWithPopup(auth, new GoogleAuthProvider());
  };

  const signOut = async () => {
    if (!auth || typeof auth.onAuthStateChanged !== "function") return;
    await fbSignOut(auth);
  };

  return (
    <Ctx.Provider value={{ user, role, loading, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
