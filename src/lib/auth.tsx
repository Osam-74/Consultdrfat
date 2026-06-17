"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  browserPopupRedirectResolver,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
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
  redirecting: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string, name: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null, role: null, loading: true, redirecting: false,
  signInEmail: async () => {},
  signUpEmail: async () => {},
  signInGoogle: async () => {},
  signOut: async () => {},
  resetPassword: async () => {},
});

function ready() {
  return auth && typeof (auth as unknown as { onAuthStateChanged?: unknown }).onAuthStateChanged === "function";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]           = useState<User | null>(null);
  const [loading, setLoading]     = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!ready()) { setLoading(false); return; }

    // Collect redirect result on mount (fires when Google sends user back)
    getRedirectResult(auth, browserPopupRedirectResolver)
      .then((result) => { if (result?.user) setUser(result.user); })
      .catch((err)   => { console.error("[getRedirectResult]", err?.code, err?.message); });

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      setRedirecting(false);
    });
    return unsub;
  }, []);

  const role: Role | null = user
    ? (user.uid === PRACTITIONER_UID ? "practitioner" : "client")
    : null;

  const signInEmail = async (email: string, password: string) => {
    if (!ready()) return;
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpEmail = async (email: string, password: string, name: string) => {
    if (!ready()) return;
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
  };

  const signInGoogle = async () => {
    if (!ready()) return;
    const provider = new GoogleAuthProvider();
    provider.addScope("email");
    provider.addScope("profile");
    provider.setCustomParameters({ prompt: "select_account" });

    try {
      // Popup with explicit resolver — works on Vercel/Cloudflare static hosts
      await signInWithPopup(auth, provider, browserPopupRedirectResolver);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      console.error("[signInWithPopup]", code, err);
      if (
        code === "auth/popup-blocked" ||
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        // Popup was blocked/closed — fall back to redirect flow
        setRedirecting(true);
        await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
        return;
      }
      throw err;
    }
  };

  const signOut = async () => {
    if (!ready()) return;
    await fbSignOut(auth);
  };

  const resetPassword = async (email: string) => {
    if (!ready()) return;
    await sendPasswordResetEmail(auth, email);
  };

  return (
    <Ctx.Provider value={{ user, role, loading, redirecting, signInEmail, signUpEmail, signInGoogle, signOut, resetPassword }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
