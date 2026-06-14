"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged, User,
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
  signIn: async () => {}, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); }), []);

  const role: Role | null = user ? (user.uid === PRACTITIONER_UID ? "practitioner" : "client") : null;

  const signIn = async () => {
    await signInWithPopup(auth, new GoogleAuthProvider());
  };
  const signOut = async () => {
    await fbSignOut(auth);
  };

  return <Ctx.Provider value={{ user, role, loading, signIn, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
