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

export default function BookPage() {
  const { user, loading, signIn } = useAuth();
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
          <div style={{ fontSize: 52, marginBottom: 16 }}>👨‍⚕️</div>
          <h2>Sign in to book your consultation</h2>
          <p>
            We use your Google account to keep your session secure and send 
            your confirmation. Your medical details stay private.
          </p>
          <button className="btn btn-primary btn-lg" onClick={() => signIn()}>
            🔒 Continue with Google
          </button>
          <p style={{ marginTop: 16, fontSize: 12, color: "var(--muted-2)" }}>
            By continuing you agree to our privacy policy.
          </p>
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
