"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
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
    // auth is a no-op stub during SSR; skip entirely on the server.
    if (!auth || typeof auth.onAuthStateChanged !== "function") {
      setLoading(false);
      return;
    }

    // Handle the redirect result when the user comes back from Google OAuth.
    // Must be called before onAuthStateChanged so user state is populated
    // correctly on the first render after the redirect completes.
    getRedirectResult(auth).catch(() => {
      // Silently ignore — user may have cancelled or closed the sign-in flow.
    });

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
    // signInWithRedirect is more reliable than signInWithPopup for static
    // exports on Vercel / Cloudflare Pages — avoids popup DOMException issues
    // caused by cross-origin postMessage restrictions in static deployments.
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithRedirect(auth, provider);
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
