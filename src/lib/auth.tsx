"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
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

// ── Google OAuth via signInWithRedirect ───────────────────────────────────────
//
// We use Firebase's signInWithRedirect (not popup) for all browsers.
//
// WHY NOT POPUP:
//   signInWithPopup opens a hidden iframe to consultdrfat.firebaseapp.com for
//   a "silent" token check before opening the popup. Firefox's Enhanced
//   Tracking Protection (ETP) blocks this cross-site iframe → NS_ERROR_NET_TIMEOUT.
//
// WHY NOT CUSTOM OAUTH (implicit flow):
//   The id_token returned by Google's implicit flow must have its 'aud' (audience)
//   match a client ID that is registered inside your Firebase project. The custom
//   flow used a different client ID than Firebase's auto-generated Web Client.
//
// SOLUTION: signInWithRedirect with getRedirectResult
//   - Full page redirect to accounts.google.com — no iframes, no popups.
//   - On return, getRedirectResult() retrieves the signed-in user.
//   - Firebase manages the token exchange internally with the correct client ID.
//
// REQUIRED SETUP (one-time, already done):
//   Firebase Console → Authentication → Settings → Authorized domains:
//     ✓ consultdrfat.vercel.app
//   Firebase Console → Authentication → Sign-in method → Google: Enabled

const provider = new GoogleAuthProvider();
provider.addScope("email");
provider.addScope("profile");
provider.setCustomParameters({ prompt: "select_account" });

// ── Context ───────────────────────────────────────────────────────────────────

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
  const [user, setUser]             = useState<User | null>(null);
  const [loading, setLoading]       = useState(true);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (!isReady()) { setLoading(false); return; }

    // Check if we just returned from a Google redirect
    const wasRedirecting = sessionStorage.getItem("gauth_redirect") === "1";
    if (wasRedirecting) {
      setGoogleLoading(true);
      sessionStorage.removeItem("gauth_redirect");
    }

    // Retrieve redirect result — works after signInWithRedirect returns
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          setUser(result.user);
        }
      })
      .catch((err) => {
        // Non-fatal — log but don't block the app
        console.warn("[getRedirectResult] error:", err?.code ?? err);
      })
      .finally(() => {
        setGoogleLoading(false);
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
    if (!isReady()) return;
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpEmail = async (email: string, password: string, name: string) => {
    if (!isReady()) return;
    await setPersistence(auth, browserLocalPersistence);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
  };

  const signInGoogle = async () => {
    if (!isReady()) return;
    await setPersistence(auth, browserLocalPersistence);
    // Mark that we're about to redirect so we can show a loading state on return
    sessionStorage.setItem("gauth_redirect", "1");
    // Full-page redirect — no iframe, no popup, works in Firefox ETP
    await signInWithRedirect(auth, provider);
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
    <Ctx.Provider value={{ user, role, loading, googleLoading, signInEmail, signUpEmail, signInGoogle, signOut, resetPassword }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
