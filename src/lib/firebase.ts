import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

// Public Firebase config — values are safe to ship in client-side code.
// Security is enforced by Firestore Security Rules, not by hiding these values.
const config = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY             || "placeholder-build-key",
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN         || "consultdrfat.firebaseapp.com",
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID          || "consultdrfat",
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET      || "consultdrfat.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "101708230797",
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID              || "1:101708230797:web:698b771ef26868be5f32c4",
};

// ---------------------------------------------------------------------------
// Lazy / SSR-safe initialisation
//
// During Next.js static export (build time) this module is imported in a
// Node.js / Edge context where there is no browser.  Calling initializeApp()
// with a placeholder key at that point causes "auth/invalid-api-key".
// We guard every call behind `typeof window !== "undefined"` so the real
// Firebase SDK is only initialised once the page loads in a browser.
// ---------------------------------------------------------------------------

function safeInitApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(config);
}

export const app: FirebaseApp = typeof window === "undefined"
  ? ({} as FirebaseApp)
  : safeInitApp();

export const auth: Auth = typeof window === "undefined"
  ? ({} as Auth)
  : getAuth(safeInitApp());

export const db: Firestore = typeof window === "undefined"
  ? ({} as Firestore)
  : getFirestore(safeInitApp());

export const PRACTITIONER_UID   = process.env.NEXT_PUBLIC_PRACTITIONER_UID   || "";
export const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "";
export const API_BASE            = process.env.NEXT_PUBLIC_API_BASE            || "";
