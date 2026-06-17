"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  GoogleAuthProvider,
  signInWithCredential,
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

// ── Google OAuth — direct implicit flow, zero Firebase iframe needed ──────────
//
// Firebase's signInWithPopup/Redirect loads consultdrfat.firebaseapp.com in a
// cross-origin iframe. Firefox Enhanced Tracking Protection times this out.
//
// Solution: drive Google OAuth ourselves using the implicit flow:
//   1. signInGoogle() saves current path to sessionStorage, redirects to accounts.google.com
//   2. Google sends user back with #id_token=... in the URL hash
//   3. On mount, consumeGoogleHash() reads the hash, calls signInWithCredential — done.
//   No iframe. No popup. No cross-origin anything except accounts.google.com itself.
//
// NEXT_PUBLIC_GOOGLE_CLIENT_ID = the "Web client ID" from:
//   Firebase Console → Authentication → Sign-in method → Google → expand → Web client ID

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const RETURN_KEY = "gauth_return";

function buildGoogleUrl(redirectUri: string): string {
  const p = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  redirectUri,
    response_type: "id_token",
    scope:         "openid email profile",
    prompt:        "select_account",
    nonce:         Math.random().toString(36).slice(2),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

// Call on mount — if the URL hash has id_token, consume it and sign in
async function consumeGoogleHash(): Promise<void> {
  if (typeof window === "undefined") return;
  const hash = window.location.hash.slice(1);
  if (!hash.includes("id_token")) return;

  const params = new URLSearchParams(hash);
  const idToken = params.get("id_token");
  if (!idToken) return;

  // Clean the hash before Firebase sees anything
  window.history.replaceState(null, "", window.location.pathname + window.location.search);

  const credential = GoogleAuthProvider.credential(idToken);
  try {
    await signInWithCredential(auth, credential);
  } catch (err) {
    console.error("[consumeGoogleHash] signInWithCredential failed:", err);
  }
}

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

    // Consume Google redirect result before anything else
    consumeGoogleHash().catch(console.error);

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

  const signInGoogle = () => {
    if (!CLIENT_ID) {
      console.error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set");
      alert("Google sign-in is not configured. Please use email/password for now.");
      return;
    }
    // redirect_uri must exactly match an entry in Google Cloud Console → OAuth → Authorised redirect URIs
    const redirectUri = window.location.href.split("#")[0].split("?")[0];
    window.location.href = buildGoogleUrl(redirectUri);
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
