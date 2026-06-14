import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Reuse the app across hot reloads / multiple imports.
export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(config);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

export const PRACTITIONER_UID = process.env.NEXT_PUBLIC_PRACTITIONER_UID || "";
export const PAYSTACK_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "";
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
