import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  onSnapshot, query, where, orderBy, Timestamp, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  PracticeSettings, DEFAULT_SETTINGS, AvailabilityTemplate, AvailabilityException,
  Booking, SessionDoc, Message, Offer, Role,
} from "./types";

/* ───────────────────────── Settings ───────────────────────── */
// NOTE: do NOT evaluate doc(db, ...) at module level — db is a stub during SSR.
// All references to db are inside async functions that only run in the browser.

export async function getSettings(): Promise<PracticeSettings> {
  const ref = doc(db, "settings", "practice");
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as PracticeSettings) : DEFAULT_SETTINGS;
}
export async function saveSettings(s: PracticeSettings) {
  await setDoc(doc(db, "settings", "practice"), s, { merge: true });
}

/* ─────────────────────── Availability ──────────────────────── */
export async function getTemplates(): Promise<AvailabilityTemplate[]> {
  const snap = await getDocs(collection(db, "availabilityTemplates"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AvailabilityTemplate, "id">) }));
}
export async function saveTemplate(t: Omit<AvailabilityTemplate, "id"> & { id?: string }) {
  if (t.id) {
    await setDoc(doc(db, "availabilityTemplates", t.id), t, { merge: true });
    return t.id;
  }
  const ref = await addDoc(collection(db, "availabilityTemplates"), t);
  return ref.id;
}
export async function deleteTemplate(id: string) {
  await deleteDoc(doc(db, "availabilityTemplates", id));
}
export async function getExceptions(): Promise<AvailabilityException[]> {
  const snap = await getDocs(collection(db, "availabilityExceptions"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AvailabilityException, "id">) }));
}
export async function addException(e: Omit<AvailabilityException, "id">) {
  await addDoc(collection(db, "availabilityExceptions"), e);
}
export async function deleteException(id: string) {
  await deleteDoc(doc(db, "availabilityExceptions", id));
}

/* ───────────────────────── Bookings ────────────────────────── */
export async function getActiveBookings(): Promise<Booking[]> {
  const q = query(
    collection(db, "bookings"),
    where("slotStart", ">", Timestamp.now()),
    orderBy("slotStart", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) }))
    .filter((b) => b.status !== "cancelled");
}

export async function createBooking(b: Omit<Booking, "id" | "createdAt">): Promise<string> {
  const ref = await addDoc(collection(db, "bookings"), { ...b, createdAt: serverTimestamp() });
  return ref.id;
}
export async function markBookingPaid(id: string, paystackRef: string) {
  await updateDoc(doc(db, "bookings", id), { status: "paid", paystackRef });
}
export function watchBookings(cb: (rows: Booking[]) => void) {
  const q = query(collection(db, "bookings"), orderBy("slotStart", "asc"));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) })))
  );
}

/* ───────────────────────── Sessions ────────────────────────── */
const sessionRef = (bookingId: string) => doc(db, "sessions", bookingId);

export function watchSession(bookingId: string, cb: (s: SessionDoc | null) => void) {
  return onSnapshot(sessionRef(bookingId), (snap) =>
    cb(snap.exists() ? (snap.data() as SessionDoc) : null)
  );
}
export async function ensureSession(bookingId: string, durationMin: number) {
  const ref = sessionRef(bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const init: SessionDoc = {
      status: "idle", endAt: null, durationMin, offer: null,
      nextClientAt: null, updatedAt: Timestamp.now(),
    };
    await setDoc(ref, init);
  }
}
export async function startSession(bookingId: string, durationMin: number) {
  await updateDoc(sessionRef(bookingId), {
    status: "live",
    endAt: Timestamp.fromMillis(Date.now() + durationMin * 60_000),
    offer: null,
    updatedAt: serverTimestamp(),
  });
}
export async function completeSession(bookingId: string) {
  await updateDoc(sessionRef(bookingId), { status: "complete", updatedAt: serverTimestamp() });
}
export async function setNextClient(bookingId: string, label: string | null) {
  await updateDoc(sessionRef(bookingId), { nextClientAt: label, updatedAt: serverTimestamp() });
}
export async function setOffer(bookingId: string, offer: Offer | null) {
  await updateDoc(sessionRef(bookingId), { offer, updatedAt: serverTimestamp() });
}
export async function confirmExtension(bookingId: string, current: SessionDoc) {
  if (!current.offer) return;
  const base = current.endAt && current.endAt.toMillis() > Date.now()
    ? current.endAt.toMillis() : Date.now();
  await updateDoc(sessionRef(bookingId), {
    status: "live",
    endAt: Timestamp.fromMillis(base + current.offer.minutes * 60_000),
    offer: { ...current.offer, status: "confirmed" },
    updatedAt: serverTimestamp(),
  });
  await sendMessage(bookingId, "system", `Session resumed — +${current.offer.minutes} minutes added.`);
}

/* ─────────────────────── Chat messages ─────────────────────── */
export function watchMessages(bookingId: string, cb: (m: Message[]) => void) {
  const q = query(collection(db, "sessions", bookingId, "messages"), orderBy("t", "asc"));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Message, "id">) })))
  );
}
export async function sendMessage(bookingId: string, from: Role | "system", text: string) {
  await addDoc(collection(db, "sessions", bookingId, "messages"), { from, text, t: Date.now() });
}
