import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

// authDomain MUST be the Firebase project's own domain (not the Vercel URL).
// This is required for signInWithPopup and signInWithRedirect to work correctly.
// Firebase Console → Authentication → Settings → Authorized domains
// must include your Vercel deploy URL (consultdrfat.vercel.app).
const config = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY             || "placeholder-build-key",
  authDomain:        "consultdrfat.firebaseapp.com",
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID          || "consultdrfat",
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET      || "consultdrfat.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "101708230797",
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID              || "1:101708230797:web:698b771ef26868be5f32c4",
};

function safeInit(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(config);
}

export const app: FirebaseApp = typeof window === "undefined" ? ({} as FirebaseApp) : safeInit();
export const auth: Auth       = typeof window === "undefined" ? ({} as Auth)        : getAuth(safeInit());
export const db: Firestore    = typeof window === "undefined" ? ({} as Firestore)   : getFirestore(safeInit());

export const PRACTITIONER_UID    = process.env.NEXT_PUBLIC_PRACTITIONER_UID    || "";
export const PAYSTACK_PUBLIC_KEY  = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "";
export const API_BASE             = process.env.NEXT_PUBLIC_API_BASE            || "";
