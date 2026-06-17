"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
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

// ── Google OAuth via Firebase signInWithPopup → fallback to signInWithRedirect ──
//
// We use Firebase's own OAuth flow (popup first, redirect fallback).
// authDomain is set to "consultdrfat.firebaseapp.com" in firebase.ts.
// Make sure the following are set in Firebase Console → Authentication →
// Sign-in method → Google → Web SDK configuration:
//   • Authorized domains includes your Vercel URL (consultdrfat.vercel.app)
// And in Google Cloud Console → APIs → Credentials → OAuth 2.0 Web Client:
//   • Authorized JavaScript origins: https://consultdrfat.vercel.app
//   • Authorized redirect URIs: https://consultdrfat.firebaseapp.com/__/auth/handler

// ── Context ───────────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null;
  role: Role | null;
  loading: boolean;
  signInEmail:   (email: string, password: string) => Promise<void>;
  signUpEmail:   (email: string, password: string, name: string) => Promise<void>;
  signInGoogle:  () => void;
  signOut:       () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null, role: null, loading: true,
  signInEmail:   async () => {},
  signUpEmail:   async () => {},
  signInGoogle:  () => {},
  signOut:       async () => {},
  resetPassword: async () => {},
});

function ready() {
  return auth &&
    typeof (auth as unknown as { onAuthStateChanged?: unknown }).onAuthStateChanged === "function";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready()) { setLoading(false); return; }

    // Handle redirect result (from signInWithRedirect fallback)
    getRedirectResult(auth).then((result) => {
      if (result?.user) {
        setUser(result.user);
      }
    }).catch((err) => {
      // Redirect result errors are non-fatal — user just needs to sign in again
      console.warn("[getRedirectResult] error:", err?.code || err);
    });

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
      // Try popup first (works in most browsers + desktop)
      await signInWithPopup(auth, provider);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      // If popup is blocked or closed, fall back to redirect
      if (
        code === "auth/popup-blocked" ||
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request" ||
        code === "auth/operation-not-supported-in-this-environment"
      ) {
        try {
          await signInWithRedirect(auth, provider);
        } catch (redirectErr) {
          console.error("[signInGoogle] redirect also failed:", redirectErr);
          throw redirectErr;
        }
      } else {
        throw err;
      }
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
    <Ctx.Provider value={{ user, role, loading, signInEmail, signUpEmail, signInGoogle, signOut, resetPassword }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
