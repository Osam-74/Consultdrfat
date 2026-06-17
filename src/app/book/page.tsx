"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  getSettings, getTemplates, getExceptions, getActiveBookings, createBooking, markBookingPaid,
} from "@/lib/db";
import { generateSlots, groupByDay, Slot } from "@/lib/slots";
import { payNGN } from "@/lib/paystack";
import { API_BASE } from "@/lib/firebase";
import { PracticeSettings, DEFAULT_SETTINGS } from "@/lib/types";
import { Timestamp } from "firebase/firestore";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ngn = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

function ClientSignIn() {
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [resetSent, setResetSent] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError("Incorrect email or password.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts — try again later or reset your password.");
      } else {
        setError("Sign-in failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch {
      setError("Could not send reset email. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (resetSent) return (
    <div style={{ textAlign: "center", maxWidth: 360 }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📬</div>
      <p style={{ color: "var(--navy)", fontWeight: 600, marginBottom: 8 }}>Check your inbox</p>
      <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 20 }}>
        A password reset link was sent to <strong>{email}</strong>.
      </p>
      <button className="btn btn-ghost btn-sm" onClick={() => { setMode("signin"); setResetSent(false); }}>
        ← Back to Sign In
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: 380, width: "100%" }}>
      <div style={{ fontSize: 52, marginBottom: 16, textAlign: "center" }}>👨‍⚕️</div>
      <h2 style={{ textAlign: "center", marginBottom: 4 }}>
        {mode === "signin" ? "Sign in to book" : "Reset Password"}
      </h2>
      <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 14, marginBottom: 24 }}>
        {mode === "signin"
          ? "Sign in to book your consultation securely."
          : "We\'ll send a reset link to your email."}
      </p>
      <form onSubmit={mode === "signin" ? handleSignIn : handleReset}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Email</label>
          <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" style={{ width: "100%", boxSizing: "border-box" }} />
        </div>
        {mode === "signin" && (
          <div style={{ marginBottom: 18, position: "relative" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Password</label>
            <input type={showPw ? "text" : "password"} required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={{ width: "100%", boxSizing: "border-box", paddingRight: 44 }} />
            <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: "absolute", right: 12, bottom: 10, background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 14, padding: 0 }}>
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        )}
        {error && <p style={{ color: "#c0392b", fontSize: 13, marginBottom: 14, background: "#fdf0ef", borderRadius: 8, padding: "8px 12px" }}>⚠️ {error}</p>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy} style={{ width: "100%", justifyContent: "center", marginBottom: 14 }}>
          {busy ? (mode === "signin" ? "Signing in…" : "Sending…") : (mode === "signin" ? "🔒 Sign In" : "📧 Send Reset Link")}
        </button>
        <div style={{ textAlign: "center" }}>
          {mode === "signin" ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMode("reset"); setError(""); }}>Forgot password?</button>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMode("signin"); setError(""); }}>← Back to Sign In</button>
          )}
        </div>
      </form>
      <p style={{ marginTop: 16, fontSize: 12, color: "var(--muted-2)", textAlign: "center" }}>
        By continuing you agree to our privacy policy.
      </p>
    </div>
  );
}


export default function BookPage() {
  const { user, loading } = useAuth();
  const [settings, setSettings] = useState<PracticeSettings>(DEFAULT_SETTINGS);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [ready, setReady] = useState(false);
  const [selDay, setSelDay] = useState<string | null>(null);
  const [selSlot, setSelSlot] = useState<Slot | null>(null);
  const [topic, setTopic] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "paying" | "booked">("idle");
  const [bookingId, setBookingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [s, t, e, b] = await Promise.all([getSettings(), getTemplates(), getExceptions(), getActiveBookings()]);
      setSettings(s);
      const taken = new Set(b.map((x) => x.slotStart.toMillis()));
      setSlots(generateSlots(s, t, e, taken));
      setReady(true);
    })().catch(() => setReady(true));
  }, []);

  const byDay = useMemo(() => groupByDay(slots), [slots]);

  const cells = useMemo(() => {
    const now = new Date(); now.setHours(0,0,0,0);
    const start = new Date(now); start.setDate(now.getDate() - now.getDay());
    const windowEnd = new Date(now); windowEnd.setDate(now.getDate() + settings.bookingWindowDays);
    return Array.from({ length: 21 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i); d.setHours(0,0,0,0);
      return { date: d, key: ymd(d), past: d < now, beyond: d >= windowEnd };
    });
  }, [settings.bookingWindowDays]);

  if (loading || !ready) return (
    <div className="center">
      <div style={{ fontSize: 40, marginBottom: 12 }}>🩺</div>
      <p style={{ color: "var(--muted)" }}>Loading available slots…</p>
    </div>
  );

  if (!user) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
        <div className="wrap">
          <nav className="nav">
            <div className="brand">
              <div className="brand-icon">🩺</div>
              <div className="brand-text">
                <span>ConsultDrFat</span>
                <small>Medical Consultations</small>
              </div>
            </div>
            <Link href="/" className="btn btn-ghost btn-sm">← Home</Link>
          </nav>
        </div>
        <div className="center" style={{ minHeight: "70vh" }}>
          <ClientSignIn />
        </div>
      </div>
    );
  }

  const daySlots = selDay ? byDay.get(selDay) ?? [] : [];

  const pay = () => {
    if (!selSlot || !user || !consent) return;
    setStatus("paying");
    createBooking({
      clientId: user.uid,
      clientName: user.displayName ?? "Client",
      clientEmail: user.email ?? "",
      slotStart: Timestamp.fromDate(selSlot.start),
      slotEnd: Timestamp.fromDate(selSlot.end),
      status: "held",
      topic,
      amountNGN: settings.priceNGN,
    }).then((id) => {
      setBookingId(id);
      payNGN({
        email: user.email ?? "",
        amountNGN: settings.priceNGN,
        metadata: { bookingId: id, kind: "session" },
        onSuccess: async (ref) => {
          try { if (API_BASE) await fetch(`${API_BASE}/verify?reference=${ref}`); } catch {}
          await markBookingPaid(id, ref);
          setStatus("booked");
        },
        onCancel: () => setStatus("idle"),
      });
    }).catch(() => setStatus("idle"));
  };

  if (status === "booked" && bookingId) {
    return (
      <div className="center" style={{ minHeight: "100vh" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <h2 style={{ color: "var(--teal)" }}>Consultation Confirmed!</h2>
        <p>
          {selSlot && (
            <>
              <strong>
                {DOW[selSlot.start.getDay()]}, {selSlot.start.getDate()} {MON[selSlot.start.getMonth()]} — {selSlot.start.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}
              </strong>
              <br />
            </>
          )}
          A confirmation email is on its way. You can join the room at the time of your appointment.
        </p>
        <Link className="btn btn-primary btn-lg" href={`/session/?id=${bookingId}&role=client`}>
          🩺 Go to My Session Room
        </Link>
        <p style={{ marginTop: 16 }}><Link href="/" style={{ color: "var(--teal)", fontSize: 14 }}>← Back to Home</Link></p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <div className="wrap">
        <nav className="nav">
          <div className="brand">
            <div className="brand-icon">🩺</div>
            <div className="brand-text">
              <span>ConsultDrFat</span>
              <small>Medical Consultations</small>
            </div>
          </div>
          <Link href="/" className="btn btn-ghost btn-sm">← Home</Link>
        </nav>

        <div className="page-head">
          <div className="lbl">🗓 Book a Consultation</div>
          <h2>Choose a time that works for you.</h2>
          <p>
            Available slots for the next {settings.bookingWindowDays} days — sessions available Mon–Sat. 
            Select a day, pick a time, and confirm your booking below.
          </p>
        </div>

        <div className="book-grid">
          {/* Calendar */}
          <div className="panel">
            <div className="panel-head">
              <h3>📅 Available Days</h3>
              <span className="windownote">Next {settings.bookingWindowDays} days</span>
            </div>
            <div className="cal">
              {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
              {cells.map((c) => {
                if (c.past) return <div key={c.key} className="day empty" />;
                if (c.beyond) return (
                  <div key={c.key} className="day locked">
                    <span className="mon">{MON[c.date.getMonth()]}</span>
                    {c.date.getDate()}
                    <span style={{ fontSize: 8 }}>🔒</span>
                  </div>
                );
                const has = byDay.has(c.key);
                const cls = "day" + (has ? " has" : " none") + (selDay === c.key ? " sel" : "");
                return (
                  <div key={c.key} className={cls} onClick={() => has && (setSelDay(c.key), setSelSlot(null))}>
                    <span className="mon">{MON[c.date.getMonth()]}</span>
                    {c.date.getDate()}
                  </div>
                );
              })}
            </div>

            <div className="muted-h">
              {selDay ? `⏰ Available times — ${selDay}` : "Select a date to see times"}
            </div>
            <div className="slots">
              {daySlots.map((s) => {
                const t = s.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const sel = selSlot?.start.getTime() === s.start.getTime();
                return (
                  <div key={s.start.getTime()} className={"slot" + (sel ? " sel" : "")} onClick={() => setSelSlot(s)}>
                    {t}
                  </div>
                );
              })}
              {selDay && daySlots.length === 0 && (
                <p style={{ color: "var(--muted)", fontSize: 13.5, gridColumn: "1 / -1" }}>
                  No open slots this day.
                </p>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="panel">
            <div className="panel-head">
              <h3>🩺 Your Consultation</h3>
            </div>

            {/* Doctor card */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--line)", marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--teal-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                👨‍⚕️
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--navy)" }}>Dr. Fat</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>General Practitioner · MDCN Registered</div>
              </div>
            </div>

            <div className="sumline">
              <span className="ic">🗓</span>
              <span style={{ color: selSlot ? "var(--ink)" : "var(--muted)" }}>
                {selSlot
                  ? `${DOW[selSlot.start.getDay()]}, ${selSlot.start.getDate()} ${MON[selSlot.start.getMonth()]} · ${selSlot.start.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`
                  : "No time selected yet"}
              </span>
            </div>
            <div className="sumline">
              <span className="ic">⏱</span>
              <span>{settings.sessionLengthMin}-minute consultation · voice + chat</span>
            </div>
            <div className="sumline">
              <span className="ic">🔒</span>
              <span>Private & encrypted session</span>
            </div>

            <div style={{ marginTop: 12 }}>
              <label htmlFor="topic">
                What is your main concern? <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                id="topic"
                rows={3}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="E.g. persistent cough for 2 weeks, recurring headaches, high blood pressure reading…"
              />
            </div>

            {/* Consent */}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14, padding: "10px 12px", background: "var(--teal-pale)", borderRadius: 10, border: "1px solid var(--line)" }}>
              <input
                type="checkbox"
                id="consent"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ marginTop: 2, width: "auto", accentColor: "var(--teal)" }}
              />
              <label htmlFor="consent" style={{ fontSize: 12.5, color: "var(--muted)", cursor: "pointer", fontWeight: 400, margin: 0 }}>
                I consent to sharing my health information with Dr. Fat for the purpose of this medical consultation.
              </label>
            </div>

            <div className="price-row">
              <span style={{ fontSize: 14, color: "var(--muted)" }}>Consultation fee</span>
              <span className="price">{ngn(settings.priceNGN)}</span>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 14 }}
              disabled={!selSlot || !consent || status === "paying"}
              onClick={pay}
            >
              {status === "paying"
                ? "⏳ Opening secure checkout…"
                : selSlot && consent
                  ? `💳 Pay ${ngn(settings.priceNGN)} & Confirm`
                  : !selSlot
                    ? "Select a time to continue"
                    : "Please accept consent above"}
            </button>
            <div className="fine">
              💳 Card · Bank Transfer · OPay · PalmPay via Paystack<br/>
              Free cancellation up to 24 hours before your session.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
