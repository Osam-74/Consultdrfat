"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  onAuthStateChanged,
  User,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";
import { auth, PRACTITIONER_UID } from "./firebase";
import { Role } from "./types";

// ── Google OAuth via signInWithPopup ─────────────────────────────────────────
//
// We use signInWithPopup (not signInWithRedirect) because:
//
// 1. This is a Next.js static export deployed on Vercel.
//    signInWithRedirect requires the browser to keep a pending auth state
//    between navigations. In a fully static export (no server), the state
//    stored by Firebase in IndexedDB/sessionStorage sometimes doesn't survive
//    the redirect round-trip on mobile browsers → user lands back at sign-in.
//
// 2. signInWithPopup opens a small window to accounts.google.com.
//    The parent page never navigates, so auth state is captured immediately
//    in the same JS context.
//
// Firefox ETP note: Firefox ETP blocks cross-site *iframes*, not popups.
//    The popup window itself is a first-party Google window — it is NOT
//    blocked. What Firefox ETP blocks is the hidden iframe that Firebase uses
//    for *session refresh* (not for the initial sign-in popup itself).
//    signInWithPopup for the initial login works fine in Firefox.
//
// If a popup is blocked by the browser (user has popups blocked), we catch
// the "popup-blocked" error and show a helpful message.

const provider = new GoogleAuthProvider();
provider.addScope("email");
provider.addScope("profile");
provider.setCustomParameters({ prompt: "select_account" });

interface AuthState {
  user: User | null;
  role: Role | null;
  loading: boolean;
  googleLoading: boolean;
  signInEmail:   (email: string, password: string) => Promise<void>;
  signUpEmail:   (email: string, password: string, name: string) => Promise<void>;
  signInGoogle:  () => Promise<void>;
  signOut:       () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null, role: null, loading: true, googleLoading: false,
  signInEmail:   async () => {},
  signUpEmail:   async () => {},
  signInGoogle:  async () => {},
  signOut:       async () => {},
  resetPassword: async () => {},
});

function isReady() {
  return auth &&
    typeof (auth as unknown as { onAuthStateChanged?: unknown }).onAuthStateChanged === "function";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                   = useState<User | null>(null);
  const [loading, setLoading]             = useState(true);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (!isReady()) { setLoading(false); return; }
    // Set persistence to local so the user stays logged in across page reloads
    setPersistence(auth, browserLocalPersistence).catch(() => {});
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

  const signUpEmail = async (email: string, password: string, name: string) => {
    if (!isReady()) return;
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
  };

  const signInGoogle = async () => {
    if (!isReady()) return;
    setGoogleLoading(true);
    try {
      const cred = await signInWithPopup(auth, provider);
      setUser(cred.user);
    } finally {
      setGoogleLoading(false);
    }
  };

  const signOut = async () => {
    if (!isReady()) return;
    await fbSignOut(auth);
    setUser(null);
  };

  const resetPassword = async (email: string) => {
    if (!isReady()) return;
    await sendPasswordResetEmail(auth, email);
  };

  return (
    <Ctx.Provider value={{ user, role, loading, googleLoading, signInEmail, signUpEmail, signInGoogle, signOut, resetPassword }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
