import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, initializeAuth, browserLocalPersistence, browserPopupRedirectResolver } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

// authDomain must always be the Firebase project's own domain.
// Firebase hosts /__/auth/handler and /__/auth/iframe there.
// This is independent of where your app itself is hosted (Vercel, Cloudflare, etc.)
const config = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY             || "placeholder-build-key",
  authDomain:        "consultdrfat.firebaseapp.com",
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID          || "consultdrfat",
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET      || "consultdrfat.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "101708230797",
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID              || "1:101708230797:web:698b771ef26868be5f32c4",
};

let _app: FirebaseApp;
let _auth: Auth;
let _db: Firestore;

function safeInit() {
  if (typeof window === "undefined") return;
  if (_app) return;
  _app = getApps().length ? getApp() : initializeApp(config);
  // initializeAuth with explicit persistence + resolver avoids the
  // "auth/internal-error" that can happen when Firebase auto-detects environment
  try {
    _auth = initializeAuth(_app, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    // Already initialized (e.g. HMR) — just get the existing instance
    _auth = getAuth(_app);
  }
  _db = getFirestore(_app);
}

if (typeof window !== "undefined") safeInit();

export { _app as app, _auth as auth, _db as db };
export const PRACTITIONER_UID    = process.env.NEXT_PUBLIC_PRACTITIONER_UID    || "";
export const PAYSTACK_PUBLIC_KEY  = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "";
export const API_BASE             = process.env.NEXT_PUBLIC_API_BASE            || "";
