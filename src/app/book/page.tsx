"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  getSettings, getTemplates, getExceptions, getActiveBookings, createBooking, markBookingPaid,
} from "@/lib/db";
import { generateSlots, groupByDay, Slot } from "@/lib/slots";
import { payNGN } from "@/lib/paystack";
import { validateDiscountCode, redeemDiscountCode } from "@/lib/db";
import { API_BASE } from "@/lib/firebase";
import SignInForm from "@/components/SignInForm";
import { PracticeSettings, DEFAULT_SETTINGS } from "@/lib/types";
import { Timestamp } from "firebase/firestore";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ngn = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;


export default function BookPage() {
  const { user, loading, signOut } = useAuth();
  const [settings, setSettings] = useState<PracticeSettings>(DEFAULT_SETTINGS);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [ready, setReady] = useState(false);
  const [selDay, setSelDay] = useState<string | null>(null);
  const [selSlot, setSelSlot] = useState<Slot | null>(null);
  const [topic, setTopic] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "paying" | "booked">("idle");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [discountCodeInput, setDiscountCodeInput] = useState("");
  const [discountValidating, setDiscountValidating] = useState(false);
  const [discountApplied, setDiscountApplied] = useState<{ id: string; code: string; percent: number } | null>(null);
  const [discountError, setDiscountError] = useState("");

  useEffect(() => {
    // Wait for auth to resolve before loading slots
    if (loading) return;
    (async () => {
      // Load each source independently so one failure doesn't kill the rest
      const [s, t, e, b] = await Promise.all([
        getSettings().catch(() => DEFAULT_SETTINGS),
        getTemplates().catch(() => []),
        getExceptions().catch(() => []),
        getActiveBookings(user?.uid ?? undefined).catch(() => []),
      ]);
      setSettings(s);
      const taken = new Set(b.map((x: { slotStart: { toMillis: () => number } }) => x.slotStart.toMillis()));
      setSlots(generateSlots(s, t, e, taken));
      setReady(true);
    })();
  }, [user, loading]);

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
    return <SignInForm title="Sign in to book" subtitle="Sign in to book your consultation securely." />;
  }

  const daySlots = selDay ? byDay.get(selDay) ?? [] : [];

  const validateDiscount = async () => {
    const raw = discountCodeInput.trim().toUpperCase();
    if (!raw) return;
    setDiscountValidating(true);
    setDiscountError("");
    setDiscountApplied(null);
    try {
      const dc = await validateDiscountCode(raw, user?.email ?? "");
      if (!dc) {
        setDiscountError("Invalid, expired, or not applicable to your account.");
      } else {
        setDiscountApplied({ id: dc.id, code: dc.code, percent: dc.percent });
      }
    } catch {
      setDiscountError("Could not validate code. Please try again.");
    } finally {
      setDiscountValidating(false);
    }
  };

  const pay = () => {
    if (!selSlot || !user || !consent) return;

    // Guard: require a valid email before creating any booking record
    const email = user.email ?? "";
    if (!email || !email.includes("@")) {
      alert("Your Google account did not provide an email address. Please sign out and sign in again.");
      return;
    }

    setStatus("paying");

    let createdId: string | null = null;
    const discountedPrice = discountApplied
      ? Math.round(settings.priceNGN * (1 - discountApplied.percent / 100))
      : settings.priceNGN;

    createBooking({
      clientId: user.uid,
      clientName: user.displayName ?? "Client",
      clientEmail: email,
      slotStart: Timestamp.fromDate(selSlot.start),
      slotEnd: Timestamp.fromDate(selSlot.end),
      status: "held",
      topic,
      amountNGN: discountedPrice,
      ...(discountApplied && {
        discountCode: discountApplied.code,
        discountCodeId: discountApplied.id,
        discountPercent: discountApplied.percent,
      }),
    }).then((id) => {
      createdId = id;
      setBookingId(id);
      payNGN({
        email,
        amountNGN: discountedPrice,
        metadata: { bookingId: id, kind: "session" },
        onSuccess: async (ref) => {
          try { if (API_BASE) await fetch(`${API_BASE}/verify?reference=${ref}`); } catch {}
          await markBookingPaid(id, ref);
          // Mark discount code as used so it can't be reused
          if (discountApplied) {
            try { await redeemDiscountCode(discountApplied.id, id); } catch { /* non-fatal */ }
          }
          setStatus("booked");
        },
        onCancel: () => {
          // User closed the popup — cancel the held booking so the slot is freed
          if (createdId) {
            import("@/lib/db").then(({ cancelBooking }) => cancelBooking(createdId!).catch(() => {}));
          }
          setStatus("idle");
        },
        onError: (err) => {
          console.error("Paystack error:", err);
          // Cancel held booking on error so the slot isn't stuck
          if (createdId) {
            import("@/lib/db").then(({ cancelBooking }) => cancelBooking(createdId!).catch(() => {}));
          }
          setStatus("idle");
          alert("Payment could not be completed. Your slot has been released. Please try again.");
        },
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
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link href="/" className="btn btn-ghost btn-sm">← Home</Link>
            <button className="btn btn-ghost btn-sm" onClick={() => signOut()} title="Sign out">Sign Out</button>
          </div>
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
          <div className="panel" style={{ minWidth: 0, overflow: "hidden" }}>
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
              {/* Discount code field */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", display: "block", marginBottom: 6 }}>
                  Discount code <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 12 }}>(optional)</span>
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    value={discountCodeInput}
                    onChange={e => {
                      setDiscountCodeInput(e.target.value.toUpperCase());
                      setDiscountApplied(null);
                      setDiscountError("");
                    }}
                    placeholder="DRFAT-XXXX"
                    style={{ flex: 1, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}
                    disabled={!!discountApplied}
                  />
                  {!discountApplied ? (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={validateDiscount}
                      disabled={!discountCodeInput.trim() || discountValidating}
                      style={{ whiteSpace: "nowrap", padding: "0 14px" }}
                    >
                      {discountValidating ? "…" : "Apply"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => { setDiscountApplied(null); setDiscountCodeInput(""); }}
                      style={{ whiteSpace: "nowrap", padding: "0 14px", color: "var(--muted)" }}
                    >Remove</button>
                  )}
                </div>
                {discountError && <p style={{ fontSize: 12, color: "#e05", margin: "6px 0 0" }}>{discountError}</p>}
                {discountApplied && (
                  <div style={{ fontSize: 13, color: "var(--teal)", fontWeight: 600, margin: "6px 0 0" }}>
                    ✓ {discountApplied.percent}% discount applied — you pay {new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Math.round(settings.priceNGN*(1-discountApplied.percent/100)))} instead of {new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(settings.priceNGN)}
                  </div>
                )}
              </div>

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
