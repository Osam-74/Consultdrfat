"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
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
  signInEmail: (email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null, role: null, loading: true,
  signInEmail: async () => {},
  signInGoogle: async () => {},
  signOut: async () => {},
  resetPassword: async () => {},
});

function isReady() {
  return auth && typeof (auth as { onAuthStateChanged?: unknown }).onAuthStateChanged === "function";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isReady()) { setLoading(false); return; }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const role: Role | null = user
    ? (user.uid === PRACTITIONER_UID ? "practitioner" : "client")
    : null;

  const signInEmail = async (email: string, password: string) => {
    if (!isReady()) return;
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signInGoogle = async () => {
    if (!isReady()) return;
    const provider = new GoogleAuthProvider();
    provider.addScope("email");
    provider.addScope("profile");
    provider.setCustomParameters({ prompt: "select_account" });
    // Log the full error so we can debug from browser console
    try {
      await signInWithPopup(auth, provider);
    } catch (err: unknown) {
      console.error("[Google Sign-In Error]", err);
      throw err;
    }
  };

  const signOut = async () => {
    if (!isReady()) return;
    await fbSignOut(auth);
  };

  const resetPassword = async (email: string) => {
    if (!isReady()) return;
    await sendPasswordResetEmail(auth, email);
  };

  return (
    <Ctx.Provider value={{ user, role, loading, signInEmail, signInGoogle, signOut, resetPassword }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
