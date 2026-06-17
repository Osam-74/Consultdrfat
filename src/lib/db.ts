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
/* ───────────────────────── Config / Practitioner ──────────── */
// Writes the practitioner UID to /config/practitioner so Firestore rules
// can look it up dynamically. Call this once after the practitioner signs in.
export async function ensurePractitionerConfig(uid: string) {
  const ref = doc(db, "config", "practitioner");
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().uid !== uid) {
    await setDoc(ref, { uid }, { merge: true });
  }
}


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

/* ─────────────────────── Email Notifications ───────────────────────
   Writes to the Firestore `mail/` collection, which is picked up
   by the Firebase "Trigger Email" extension (Brevo SMTP).
   
   Install: Firebase console → Extensions → Trigger Email from Firestore
   SMTP URI: smtps://<login>:<key>@smtp-relay.brevo.com:465
   Collection: mail
   Default FROM: "ConsultDrFat <noreply@consultdrfat.com>"
──────────────────────────────────────────────────────────────────── */

interface EmailPayload {
  to: string;
  message: { subject: string; html: string };
}

async function queueEmail(payload: EmailPayload) {
  // Only attempt if Firestore is available
  try {
    await addDoc(collection(db, "mail"), payload);
  } catch (e) {
    // Non-fatal — email is best-effort; booking confirmation is primary
    console.warn("Email queue failed:", e);
  }
}

function bookingConfirmationHtml(clientName: string, slot: Date, amountNGN: number): string {
  const slotStr = slot.toLocaleString("en-NG", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos",
  });
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f8f8f6;margin:0;padding:0">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(11,43,74,.10)">
    <div style="background:linear-gradient(135deg,#0B2B4A,#0B3D5C);padding:32px 32px 24px;text-align:center">
      <div style="font-size:36px;margin-bottom:8px">🩺</div>
      <h1 style="color:#fff;font-size:22px;margin:0 0 6px;font-family:Georgia,serif">Consultation Confirmed</h1>
      <p style="color:rgba(255,255,255,.7);font-size:14px;margin:0">ConsultDrFat · Medical Consultations</p>
    </div>
    <div style="padding:32px">
      <p style="font-size:16px;color:#0E1C2A;margin:0 0 20px">Hi ${clientName},</p>
      <p style="font-size:14.5px;color:#5A6A78;line-height:1.65;margin:0 0 24px">
        Your consultation with Dr. Fat has been confirmed and paid. Here are your details:
      </p>
      <div style="background:#F0FAF9;border-radius:12px;padding:20px 24px;margin-bottom:24px;border:1px solid rgba(14,138,122,.15)">
        <div style="display:flex;gap:12px;margin-bottom:14px;align-items:flex-start">
          <span style="font-size:18px">📅</span>
          <div>
            <div style="font-size:12px;color:#0E8A7A;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Date &amp; Time</div>
            <div style="font-size:15px;font-weight:600;color:#0E1C2A">${slotStr} (WAT)</div>
          </div>
        </div>
        <div style="display:flex;gap:12px;align-items:flex-start">
          <span style="font-size:18px">💳</span>
          <div>
            <div style="font-size:12px;color:#0E8A7A;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Amount Paid</div>
            <div style="font-size:15px;font-weight:600;color:#0E1C2A">₦${amountNGN.toLocaleString()}</div>
          </div>
        </div>
      </div>
      <div style="background:#FDF6E7;border-radius:10px;padding:14px 18px;margin-bottom:24px;border-left:4px solid #C8963A">
        <p style="margin:0;font-size:13.5px;color:#1E3347;line-height:1.6">
          <strong>How to join:</strong> Visit <a href="https://consultdrfat.com/book/" style="color:#0E8A7A">consultdrfat.com/book</a> and sign in with your Google account. Your session room will be accessible from your bookings at the scheduled time.
        </p>
      </div>
      <p style="font-size:13px;color:#8FA0B0;line-height:1.6;margin:0 0 8px">
        You'll receive a reminder 24 hours and 1 hour before your session. If you need to reschedule, 
        please email <a href="mailto:hello@consultdrfat.com" style="color:#0E8A7A">hello@consultdrfat.com</a> 
        at least 24 hours before your appointment.
      </p>
      <p style="font-size:13px;color:#8FA0B0;margin:0">
        🔒 Your consultation is fully encrypted and confidential.
      </p>
    </div>
    <div style="background:#F0F3F6;padding:20px 32px;text-align:center;border-top:1px solid #E0E8EF">
      <p style="font-size:12px;color:#8FA0B0;margin:0">
        ConsultDrFat · Private Medical Consultations · Nigeria<br>
        <a href="https://consultdrfat.com/privacy/" style="color:#0E8A7A">Privacy Policy</a> · 
        <a href="https://consultdrfat.com/terms/" style="color:#0E8A7A">Terms of Service</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function reminderHtml(clientName: string, slot: Date, minutesBefore: number): string {
  const slotStr = slot.toLocaleString("en-NG", {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos",
  });
  const timeLabel = minutesBefore === 60 ? "1 hour" : "24 hours";
  return `
<!DOCTYPE html>
<html>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f8f8f6;margin:0;padding:0">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(11,43,74,.10)">
    <div style="background:linear-gradient(135deg,#0B2B4A,#0E8A7A);padding:28px 32px;text-align:center">
      <div style="font-size:32px;margin-bottom:6px">⏰</div>
      <h1 style="color:#fff;font-size:20px;margin:0;font-family:Georgia,serif">Session Reminder</h1>
      <p style="color:rgba(255,255,255,.7);font-size:13px;margin:6px 0 0">Your consultation is in ${timeLabel}</p>
    </div>
    <div style="padding:28px 32px">
      <p style="font-size:15px;color:#0E1C2A;margin:0 0 16px">Hi ${clientName},</p>
      <p style="font-size:14px;color:#5A6A78;line-height:1.6;margin:0 0 20px">
        This is a friendly reminder that your consultation with Dr. Fat is coming up:
      </p>
      <div style="background:#F0FAF9;border-radius:10px;padding:16px 20px;margin-bottom:20px;font-size:15px;font-weight:600;color:#0E1C2A;border:1px solid rgba(14,138,122,.15)">
        📅 ${slotStr} (WAT)
      </div>
      <p style="font-size:13px;color:#5A6A78;margin:0 0 16px">
        Sign in with your Google account at <a href="https://consultdrfat.com/book/" style="color:#0E8A7A">consultdrfat.com/book</a> a few minutes early. Make sure you&apos;re in a quiet, private location.
      </p>
      <div style="background:#FDF6E7;border-radius:8px;padding:12px 16px;font-size:13px;color:#1E3347;line-height:1.5;border-left:3px solid #C8963A">
        💡 <strong>Tip:</strong> Have your key symptoms or questions ready. You have 30 minutes — making the most of them helps you get the best care.
      </div>
    </div>
    <div style="background:#F0F3F6;padding:16px 32px;text-align:center;border-top:1px solid #E0E8EF">
      <p style="font-size:11px;color:#8FA0B0;margin:0">ConsultDrFat · 🔒 Encrypted · 🇳🇬 Nigeria</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Queue a booking confirmation email.
 * Call this immediately after markBookingPaid.
 */
export async function sendBookingConfirmationEmail(
  toEmail: string,
  clientName: string,
  slotStart: Date,
  amountNGN: number
) {
  await queueEmail({
    to: toEmail,
    message: {
      subject: "✅ Your ConsultDrFat consultation is confirmed",
      html: bookingConfirmationHtml(clientName, slotStart, amountNGN),
    },
  });
}

/**
 * Queue a reminder email.
 * minutesBefore: 1440 (24h) or 60 (1h)
 * Call this from the Cloudflare scheduled Worker cron job.
 */
export async function sendReminderEmail(
  toEmail: string,
  clientName: string,
  slotStart: Date,
  minutesBefore: number
) {
  await queueEmail({
    to: toEmail,
    message: {
      subject: minutesBefore === 60
        ? "⏰ Your Dr. Fat session starts in 1 hour"
        : "⏰ Reminder: Your Dr. Fat session is tomorrow",
      html: reminderHtml(clientName, slotStart, minutesBefore),
    },
  });
}
