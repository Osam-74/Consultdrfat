import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, Timestamp, serverTimestamp,
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
  return snap.docs.map((d) => {
    const data = d.data() as Omit<AvailabilityTemplate, "id">;
    return {
      id: d.id,
      ...data,
      weekday: Number(data.weekday), // Firestore may return as string — coerce to number
    };
  });
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
export async function getActiveBookings(clientUid?: string): Promise<Booking[]> {
  // Firestore rules only allow clients to read their own bookings.
  // A query without a clientId filter gets PERMISSION_DENIED and kills Promise.all.
  // If no uid is provided (not yet authenticated) return empty — no taken slots.
  if (!clientUid) return [];
  try {
    const q = query(
      collection(db, "bookings"),
      where("clientId", "==", clientUid),
      where("slotStart", ">", Timestamp.now()),
      orderBy("slotStart", "asc")
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) }))
      .filter((b) => b.status !== "cancelled");
  } catch {
    // Non-fatal — if this fails, just show all slots as available
    return [];
  }
}

export async function createBooking(b: Omit<Booking, "id" | "createdAt">): Promise<string> {
  const ref = await addDoc(collection(db, "bookings"), { ...b, createdAt: serverTimestamp() });
  return ref.id;
}

/** Fetch a single booking by its document id */
export async function getBookingById(bookingId: string): Promise<Booking | null> {
  const snap = await getDoc(doc(db, "bookings", bookingId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Booking, "id">) };
}
export async function markBookingPaid(id: string, paystackRef: string) {
  await updateDoc(doc(db, "bookings", id), { status: "paid", paystackRef, sessionStatus: "idle" });
}
export async function cancelBooking(id: string) {
  await updateDoc(doc(db, "bookings", id), { status: "cancelled" });
}
export function watchBookings(cb: (rows: Booking[]) => void) {
  // Query ALL bookings sorted by slotStart (limited to 100), including archived.
  // Components filter archived client-side for display, but the raw data
  // includes archived bookings for earnings/completed-count calculations.
  // Previously used Firestore `where("archived", "!=", true)` which excludes
  // documents that don't have the `archived` field — hiding new bookings.
  const q = query(
    collection(db, "bookings"),
    orderBy("slotStart", "asc"),
    limit(100)
  );
  return onSnapshot(q, 
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) }))),
    (err) => console.error("[watchBookings] onSnapshot error:", err.message)
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
  // If the session already exists (even if complete), leave it untouched.
  // Completed sessions stay complete — they are not restarted.
}
export async function startSession(bookingId: string, durationMin: number) {
  const ref = sessionRef(bookingId);
  const snap = await getDoc(ref);
  // Never restart a completed session
  if (snap.exists() && (snap.data() as SessionDoc).status === "complete") return;
  await updateDoc(ref, {
    status: "live",
    endAt: Timestamp.fromMillis(Date.now() + durationMin * 60_000),
    offer: null,
    updatedAt: serverTimestamp(),
  });
  // Mark booking as inSession so waiting room removes the client immediately.
  // Also cache sessionStatus on the booking so dashboard never needs extra reads.
  await updateDoc(doc(db, "bookings", bookingId), { inSession: true, sessionStatus: "live" });
}
export async function completeSession(bookingId: string) {
  // Mark session as complete
  await updateDoc(sessionRef(bookingId), { status: "complete", updatedAt: serverTimestamp() });
  // Clear inSession + set completedAt on booking — but do NOT auto-archive.
  // Practitioner archives manually. This keeps the booking visible in their list.
  try {
    await updateDoc(doc(db, "bookings", bookingId), {
      inSession: false,
      completedAt: serverTimestamp(),
      sessionStatus: "complete",
    });
  } catch { /* non-fatal — session doc is the source of truth */ }
}
/** Called when client manually exits — removes them from the waiting room view. */
export async function clearInSession(bookingId: string): Promise<void> {
  try {
    await updateDoc(doc(db, "bookings", bookingId), { inSession: false });
  } catch { /* non-fatal */ }
}

/** Called when client intentionally leaves — posts a system message so practitioner is notified. */
export async function clientLeftSession(bookingId: string): Promise<void> {
  try {
    await sendMessage(bookingId, "system", "👋 Client has left the session.");
    await updateDoc(doc(db, "bookings", bookingId), { inSession: false });
  } catch { /* non-fatal */ }
}

export async function setNextClient(bookingId: string, label: string | null) {
  await updateDoc(sessionRef(bookingId), { nextClientAt: label, updatedAt: serverTimestamp() });
}
export async function setOffer(bookingId: string, offer: Offer | null) {
  await updateDoc(sessionRef(bookingId), { offer, updatedAt: serverTimestamp() });
}

/** Client requests an extension — notifies practitioner via session doc */
export async function requestExtension(bookingId: string): Promise<void> {
  await updateDoc(sessionRef(bookingId), {
    clientExtRequest: "pending",
    updatedAt: serverTimestamp(),
  });
  await sendMessage(bookingId, "system", "Client has requested extra time for this session.");
}

/** Practitioner clears the client extension request after responding */
export async function clearExtRequest(bookingId: string): Promise<void> {
  await updateDoc(sessionRef(bookingId), {
    clientExtRequest: "responded",
    updatedAt: serverTimestamp(),
  });
}
export async function confirmExtension(bookingId: string, current: SessionDoc) {
  if (!current.offer) return;
  const base = current.endAt && current.endAt.toMillis() > Date.now()
    ? current.endAt.toMillis() : Date.now();
  await updateDoc(sessionRef(bookingId), {
    status: "live",
    endAt: Timestamp.fromMillis(base + current.offer.minutes * 60_000),
    offer: { ...current.offer, status: "confirmed" },
    clientExtRequest: "responded",
    updatedAt: serverTimestamp(),
  });
  const freeNote = current.offer.priceNGN === 0 || current.offer.isFree ? " (free)" : "";
  await sendMessage(bookingId, "system", `Session resumed — +${current.offer.minutes} minutes added${freeNote}.`);
}

/* ─────────────────────── Chat messages ─────────────────────── */
export function watchMessages(bookingId: string, cb: (m: Message[]) => void) {
  const q = query(collection(db, "sessions", bookingId, "messages"), orderBy("t", "asc"));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Message, "id">) })))
  );
}
export async function sendMessage(
  bookingId: string,
  from: Role | "system",
  text: string,
  file?: { url: string; type: string; name: string; size: number },
  replyTo?: { id: string; text: string; from: string }
) {
  const payload: Record<string, unknown> = { from, text, t: Date.now() };
  if (file) {
    payload.fileUrl  = file.url;
    payload.fileType = file.type;
    payload.fileName = file.name;
    payload.fileSize = file.size;
  }
  if (replyTo) {
    payload.replyToId = replyTo.id;
    payload.replyToText = replyTo.text.slice(0, 120); // truncate for display
    payload.replyToFrom = replyTo.from;
  }
  await addDoc(collection(db, "sessions", bookingId, "messages"), payload);
}

/**
 * Upload a session file to the Cloudflare Worker → R2 bucket.
 * Returns the public CDN URL.
 */
export async function uploadSessionFile(
  bookingId: string,
  file: File,
  apiBase: string
): Promise<{ url: string; type: string; name: string; size: number }> {
  if (!apiBase) throw new Error(
    "NEXT_PUBLIC_API_BASE is not set. " +
    "Go to Vercel → Project Settings → Environment Variables and add NEXT_PUBLIC_API_BASE = https://your-worker.workers.dev, then redeploy."
  );

  const form = new FormData();
  form.append("file", file);
  form.append("bookingId", bookingId);

  const res = await fetch(`${apiBase}/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Upload failed (${res.status})`);
  }
  const data = await res.json() as { ok: boolean; url: string };
  return { url: data.url, type: file.type, name: file.name, size: file.size };
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

/* ─────────────────────── Discount Codes ─────────────────────── */

export interface DiscountCode {
  id: string;
  code: string;           // e.g. "DRFAT-3X7K"
  percent: number;        // 10 | 20 | 30 | 50 etc.
  createdFor: string;     // client email
  createdForName: string;
  createdForUid: string;
  bookingId: string;      // session where it was generated
  used: boolean;
  usedAt?: Timestamp;
  usedInBookingId?: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;   // 90 days from creation
}

/** Generate a short alphanumeric code like "DRFAT-3X7K" */
function makeCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing 0/O/1/I
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `DRFAT-${suffix}`;
}

/**
 * Generate and store a discount code for a client.
 * Called from the practitioner during a live session.
 * Returns the saved DiscountCode (with id).
 */
export async function createDiscountCode(opts: {
  percent: number;
  clientEmail: string;
  clientName: string;
  clientUid: string;
  bookingId: string;
}): Promise<DiscountCode> {
  const now = Timestamp.now();
  const expires = Timestamp.fromMillis(now.toMillis() + 90 * 24 * 60 * 60 * 1000);
  const code = makeCode();
  const payload = {
    code,
    percent: opts.percent,
    createdFor: opts.clientEmail,
    createdForName: opts.clientName,
    createdForUid: opts.clientUid,
    bookingId: opts.bookingId,
    used: false,
    createdAt: now,
    expiresAt: expires,
  };
  const ref = await addDoc(collection(db, "discountCodes"), payload);
  return { id: ref.id, ...payload };
}

/**
 * Validate a discount code for a given client email.
 * Returns the code doc if valid, null if invalid/expired/used/wrong client.
 */
export async function validateDiscountCode(
  code: string,
  clientEmail: string
): Promise<DiscountCode | null> {
  const q = query(
    collection(db, "discountCodes"),
    where("code", "==", code.trim().toUpperCase()),
    where("used", "==", false)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = { id: snap.docs[0].id, ...snap.docs[0].data() } as DiscountCode;
  if (d.createdFor.toLowerCase() !== clientEmail.toLowerCase()) return null;
  if (d.expiresAt.toMillis() < Date.now()) return null;
  return d;
}

/** Mark a discount code as used */
export async function redeemDiscountCode(codeId: string, bookingId: string) {
  await updateDoc(doc(db, "discountCodes", codeId), {
    used: true,
    usedAt: Timestamp.now(),
    usedInBookingId: bookingId,
  });
}

/** Watch all discount codes (practitioner view) — ordered by createdAt desc */
export function watchDiscountCodes(cb: (codes: DiscountCode[]) => void) {
  // One-time fetch instead of a live listener — discount codes change rarely.
  // Dashboard calls refresh() manually after creating/redeeming a code.
  const q = query(collection(db, "discountCodes"), orderBy("createdAt", "desc"), limit(50));
  getDocs(q).then((snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DiscountCode)));
  }).catch(() => cb([]));
  // Return no-op unsubscribe to keep call-site compatible
  return () => {};
}

/** Queue a discount notification email */
export async function sendDiscountEmail(opts: {
  toEmail: string;
  clientName: string;
  code: string;
  percent: number;
  expiresAt: Date;
}) {
  const exp = opts.expiresAt.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
  await queueEmail({
    to: opts.toEmail,
    message: {
      subject: `🎁 You've received a ${opts.percent}% discount from Dr. Fat`,
      html: `
<!DOCTYPE html>
<html>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f8f8f6;margin:0;padding:0">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(11,43,74,.10)">
    <div style="background:linear-gradient(135deg,#0B2B4A,#0E8A7A);padding:28px 32px;text-align:center">
      <div style="font-size:42px;margin-bottom:6px">🎁</div>
      <h1 style="color:#fff;font-size:22px;margin:0;font-family:Georgia,serif">You've got a discount!</h1>
      <p style="color:rgba(255,255,255,.75);font-size:13px;margin:8px 0 0">A special offer from your practitioner</p>
    </div>
    <div style="padding:28px 32px">
      <p style="font-size:15px;color:#0E1C2A;margin:0 0 12px">Hi ${opts.clientName},</p>
      <p style="font-size:14px;color:#5A6A78;line-height:1.6;margin:0 0 20px">
        Dr. Fat has sent you a special discount for your next consultation:
      </p>
      <div style="background:#F0FAF9;border-radius:14px;padding:24px;text-align:center;margin-bottom:20px;border:2px dashed #0E8A7A">
        <div style="font-size:13px;color:#5A6A78;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Your discount code</div>
        <div style="font-size:32px;font-weight:800;color:#0E8A7A;letter-spacing:.12em;font-family:monospace">${opts.code}</div>
        <div style="font-size:28px;font-weight:700;color:#0B2B4A;margin-top:8px">${opts.percent}% OFF</div>
        <div style="font-size:12px;color:#8FA0B0;margin-top:8px">Valid until ${exp}</div>
      </div>
      <p style="font-size:13px;color:#5A6A78;margin:0 0 16px;line-height:1.6">
        Enter this code in the <strong>"Discount code"</strong> field when booking your next session at
        <a href="https://consultdrfat.vercel.app/book/" style="color:#0E8A7A">consultdrfat.vercel.app/book</a>.
        The discount is applied automatically — only you can use this code.
      </p>
    </div>
    <div style="background:#F0F3F6;padding:16px 32px;text-align:center;border-top:1px solid #E0E8EF">
      <p style="font-size:11px;color:#8FA0B0;margin:0">ConsultDrFat · 🔒 Encrypted · 🇳🇬 Nigeria</p>
    </div>
  </div>
</body>
</html>`,
    },
  });
}

/* ─────────────────────── Attachment Toggle ─────────────────────── */

/**
 * Toggle whether clients can attach files in the session.
 * Stored on the session doc as `attachmentsEnabled: boolean`.
 */
export async function setAttachmentsEnabled(bookingId: string, enabled: boolean) {
  await updateDoc(doc(db, "sessions", bookingId), { attachmentsEnabled: enabled });
}

/* ─────────────────────── Client booking history ─────────────────────── */

/**
 * Get all paid bookings for a client (for booking history tab).
 * Ordered newest-first. Includes past sessions.
 */
export async function getClientBookings(clientUid: string): Promise<Booking[]> {
  // Query by clientId only + sort by slotStart desc.
  // Filtering by status here would require a 3-field composite index that isn't
  // always deployed; instead we filter client-side to exclude cancelled bookings.
  const q = query(
    collection(db, "bookings"),
    where("clientId", "==", clientUid),
    orderBy("slotStart", "desc"),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) }))
    .filter((b) => b.status !== "cancelled");
}

/**
 * Get the live session doc for a booking, if it exists and is still "live".
 * Returns null if no session or not in live state.
 */
/** Find the next upcoming paid booking after the current one — narrow query to save quota.
 *  Only looks at bookings starting within the next 8 hours, limited to 20 docs.
 */
export async function getNextClientBooking(currentBookingId: string, currentSlotMs: number): Promise<{ id: string; slotStart: { toMillis: () => number } } | null> {
  try {
    const q = query(
      collection(db, "bookings"),
      where("slotStart", ">", Timestamp.fromMillis(currentSlotMs)),
      where("slotStart", "<=", Timestamp.fromMillis(currentSlotMs + 8 * 60 * 60 * 1000)),
      orderBy("slotStart", "asc"),
      limit(20)
    );
    const snap = await getDocs(q);
    const next = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as { id: string; slotStart: { toMillis: () => number }; status: string; archived?: boolean }))
      .find(b => b.status === "paid" && !b.archived && b.id !== currentBookingId);
    return next ? { id: next.id, slotStart: next.slotStart } : null;
  } catch { return null; }
}

export async function getLiveSession(bookingId: string): Promise<SessionDoc | null> {
  const snap = await getDoc(doc(db, "sessions", bookingId));
  if (!snap.exists()) return null;
  const s = snap.data() as SessionDoc;
  return s.status === "live" ? s : null;
}

/** Real-time session watcher for the client booking page.
 *  Calls cb whenever the session doc changes (status, endAt, etc.)
 *  Returns unsubscribe function.
 */
export function watchSessionStatus(
  bookingId: string,
  cb: (status: "idle" | "live" | "complete" | null) => void
): () => void {
  return onSnapshot(doc(db, "sessions", bookingId), (snap) => {
    if (!snap.exists()) { cb(null); return; }
    cb((snap.data() as SessionDoc).status ?? null);
  });
}

/* ─────────────────────── Waiting Room / Archive ──────────────────────────
   Practitioner can see who is "in the waiting room" = has a paid booking
   whose slot is within the next 90 minutes and whose session is idle/not started.
   Archive = mark a session as archived so it doesn't clutter the bookings list.
──────────────────────────────────────────────────────────────────────────── */

/** Watch paid bookings whose slot falls within [-30 min, +90 min] of now.
 *  This covers:
 *  - Upcoming clients (arriving early)
 *  - Clients already in the room (slot started up to 30 min ago)
 */
export function watchWaitingRoom(cb: (rows: Booking[]) => void) {
  // Watch bookings in a rolling [-30min, +2h] window around now.
  // Limited to 50 docs to minimise reads. The window is computed at subscription
  // time — the onSnapshot listener fires on every change within that window, so
  // the client-side filter always uses freshNow for the rolling cutoff.
  const windowStart = Timestamp.fromMillis(Date.now() - 2 * 60 * 60 * 1000);
  const windowEnd   = Timestamp.fromMillis(Date.now() + 8 * 60 * 60 * 1000);
  const q = query(
    collection(db, "bookings"),
    where("slotStart", ">=", windowStart),
    where("slotStart", "<=", windowEnd),
    orderBy("slotStart", "asc"),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    const freshNow = Date.now();
    const freshStart = freshNow - 30 * 60 * 1000;
    const freshEnd   = freshNow + 2 * 60 * 60 * 1000;
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) }))
      .filter((b) => {
        const ms = b.slotStart.toMillis();
        const pingTime = (b as unknown as Record<string, unknown>).clientPing as number | undefined;
        const hasFreshPing = pingTime && typeof pingTime === "number" && (freshNow - pingTime) < 5 * 60 * 1000;
        return (
          b.status === "paid" &&   // only confirmed-paid bookings
          !b.archived &&           // not archived by practitioner
          !b.inSession &&          // not already in a live session
          // within rolling window OR has a fresh ping (actively waiting right now)
          ((ms >= freshStart && ms <= freshEnd) || hasFreshPing)
        );
      });
    cb(rows);
  });
}

/** Archive a booking (soft-delete from active list) */
export async function archiveBooking(id: string) {
  await updateDoc(doc(db, "bookings", id), { archived: true });
}

/** Permanently delete a booking and its session subcollection */
export async function deleteBookingPermanently(bookingId: string): Promise<void> {
  // Delete session messages subcollection
  try {
    const msgsSnap = await getDocs(collection(db, "sessions", bookingId, "messages"));
    await Promise.all(msgsSnap.docs.map(d => deleteDoc(d.ref)));
  } catch { /* non-fatal */ }
  // Delete session doc
  try { await deleteDoc(doc(db, "sessions", bookingId)); } catch { /* non-fatal */ }
  // Delete booking doc
  await deleteDoc(doc(db, "bookings", bookingId));
}

/** Restore an archived booking back to active */
export async function unarchiveBooking(id: string): Promise<void> {
  await updateDoc(doc(db, "bookings", id), { archived: false });
}

/**
 * Reschedule a booking to a new slot.
 * Only allowed once per booking (rescheduledOnce flag).
 * Requires a reschedule fee payment — caller handles Paystack flow.
 */
export async function rescheduleBooking(
  bookingId: string,
  newSlotStart: Timestamp,
  newSlotEnd: Timestamp,
): Promise<void> {
  await updateDoc(doc(db, "bookings", bookingId), {
    slotStart: newSlotStart,
    slotEnd: newSlotEnd,
    rescheduledOnce: true,
  });
}

/**
 * Write a presence heartbeat for a user inside a session.
 * Call every 15s while the session is open.
 */
export async function pingPresence(bookingId: string, uid: string): Promise<void> {
  try {
    // Presence heartbeat — only write the timestamp field (not updatedAt) to
    // avoid triggering downstream watchSession listeners unnecessarily.
    // Rate is intentionally low (90s interval) to conserve Firestore write quota.
    await updateDoc(sessionRef(bookingId), {
      [`presence.${uid}`]: Date.now(),
    });
  } catch { /* non-fatal */ }
}

/** Watch non-archived bookings for the practitioner */
export function watchActiveBookings(cb: (rows: Booking[]) => void) {
  // Filter archived client-side — Firestore `!=` excludes docs without the field.
  const q = query(
    collection(db, "bookings"),
    orderBy("slotStart", "asc"),
    limit(100)
  );
  return onSnapshot(q, (snap) =>
    cb(snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) }))
      .filter((b) => !b.archived)
    )
  );
}

/** Get session status for a booking (for waiting room check) */
export async function getSessionStatus(bookingId: string): Promise<"none" | "idle" | "live" | "complete"> {
  // Fast path: check booking doc's cached sessionStatus field (written by startSession/completeSession)
  try {
    const bSnap = await getDoc(doc(db, "bookings", bookingId));
    if (bSnap.exists()) {
      const cached = (bSnap.data() as Record<string, unknown>).sessionStatus as string | undefined;
      if (cached === "live" || cached === "complete" || cached === "idle") return cached;
    }
  } catch { /* fall through to session doc */ }
  // Slow path: read the session doc directly
  try {
    const snap = await getDoc(doc(db, "sessions", bookingId));
    if (!snap.exists()) return "none";
    return (snap.data() as SessionDoc).status;
  } catch {
    return "none";
  }
}

/* ─────────────────────── Client Ping / Notify ──────────────────────────
   Instead of polling the waiting room every few seconds (which burns quota),
   the client presses a "Notify" button in the session room. This writes a
   `clientPing` timestamp on the booking doc. The practitioner dashboard
   watches bookings in real-time and shows a notification + plays a sound
   when it sees a fresh ping (within the last 60 seconds).
   The client can only ping once every 5 minutes (enforced client-side).
──────────────────────────────────────────────────────────────────────────── */

/** Client presses "Notify" — stamps booking with current time as clientPing */
export async function notifyPractitioner(bookingId: string): Promise<void> {
  try {
    await updateDoc(doc(db, "bookings", bookingId), {
      clientPing: Date.now(),
    });
  } catch { /* non-fatal */ }
}

/* ─────────────────────── Client Notes ──────────────────────────
   Practitioner can write notes about a client's consultation.
   Notes are stored in /clients/{clientId}/notes subcollection.
   Each note has: text, createdAt timestamp, optional bookingId.
──────────────────────────────────────────────────────────────────── */

export interface ClientNote {
  id: string;
  text: string;
  createdAt: Timestamp;
  bookingId?: string;
}

/** Watch all notes for a client in real-time */
export function watchClientNotes(clientId: string, cb: (notes: ClientNote[]) => void) {
  const q = query(
    collection(db, "clients", clientId, "notes"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snap) => {
    const notes = snap.docs.map(d => ({
      id: d.id,
      ...(d.data() as Omit<ClientNote, "id">),
    }));
    cb(notes);
  }, (err) => {
    console.warn("[watchClientNotes]", err);
  });
}

/** Add a new note for a client */
export async function addClientNote(clientId: string, text: string, bookingId?: string): Promise<void> {
  await addDoc(collection(db, "clients", clientId, "notes"), {
    text,
    bookingId: bookingId || null,
    createdAt: serverTimestamp(),
  });
}

/** Delete a note */
export async function deleteClientNote(clientId: string, noteId: string): Promise<void> {
  await deleteDoc(doc(db, "clients", clientId, "notes", noteId));
}

/** Get all bookings for a specific client (for client detail page) */
export async function getClientBookingsById(clientId: string): Promise<Booking[]> {
  const q = query(
    collection(db, "bookings"),
    where("clientId", "==", clientId),
    orderBy("slotStart", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    ...(d.data() as Omit<Booking, "id">),
  }));
}
