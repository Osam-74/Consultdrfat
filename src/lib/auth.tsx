"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
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
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null, role: null, loading: true,
  signIn: async () => {},
  signOut: async () => {},
  resetPassword: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

  const signIn = async (email: string, password: string) => {
    if (!auth || typeof auth.onAuthStateChanged !== "function") return;
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    if (!auth || typeof auth.onAuthStateChanged !== "function") return;
    await fbSignOut(auth);
  };

  const resetPassword = async (email: string) => {
    if (!auth || typeof auth.onAuthStateChanged !== "function") return;
    await sendPasswordResetEmail(auth, email);
  };

  return (
    <Ctx.Provider value={{ user, role, loading, signIn, signOut, resetPassword }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
