"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  getSettings, getTemplates, getExceptions, getActiveBookings, createBooking, markBookingPaid,
  getClientBookings, getLiveSession, cancelBooking,
} from "@/lib/db";
import { validateDiscountCode, redeemDiscountCode } from "@/lib/db";
import { generateSlots, groupByDay, Slot } from "@/lib/slots";
import { payNGN } from "@/lib/paystack";
import { API_BASE } from "@/lib/firebase";
import SignInForm from "@/components/SignInForm";
import { PracticeSettings, DEFAULT_SETTINGS, Booking, SessionDoc } from "@/lib/types";
import { Timestamp } from "firebase/firestore";

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ngn = (n: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

function fmtSlot(d: Date) {
  return `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

type SessionStatus = "upcoming" | "live" | "completed";
interface RecentItem {
  booking: Booking;
  sessionStatus: SessionStatus;
  session: SessionDoc | null;
}

export default function BookPage() {
  const { user, loading, signOut } = useAuth();
  const [settings, setSettings]   = useState<PracticeSettings>(DEFAULT_SETTINGS);
  const [slots, setSlots]         = useState<Slot[]>([]);
  const [ready, setReady]         = useState(false);
  const [selDay, setSelDay]       = useState<string | null>(null);
  const [selSlot, setSelSlot]     = useState<Slot | null>(null);
  const [topic, setTopic]         = useState("");
  const [consent, setConsent]     = useState(false);
  const [status, setStatus]       = useState<"idle" | "paying" | "booked">("idle");
  const [bookingId, setBookingId] = useState<string | null>(null);

  // Discount
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountInput, setDiscountInput]     = useState("");
  const [discountValidating, setDiscountValidating] = useState(false);
  const [discountApplied, setDiscountApplied] = useState<{ id: string; code: string; percent: number } | null>(null);
  const [discountError, setDiscountError]     = useState("");

  // Recent sessions
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  useEffect(() => {
    if (loading) return;
    (async () => {
      const [s, t, e, b] = await Promise.all([
        getSettings().catch(() => DEFAULT_SETTINGS),
        getTemplates().catch(() => []),
        getExceptions().catch(() => []),
        getActiveBookings(user?.uid ?? undefined).catch(() => []),
      ]);
      setSettings(s);
      const taken = new Set(b.map((x: Booking) => x.slotStart.toMillis()));
      setSlots(generateSlots(s, t, e, taken));
      setReady(true);

      if (user?.uid) {
        setRecentLoading(true);
        try {
          const bookings = await getClientBookings(user.uid);
          const now = Date.now();
          const items: RecentItem[] = [];
          for (const bk of bookings.slice(0, 8)) {
            const slotMs = bk.slotStart.toMillis();
            let sess: SessionDoc | null = null;
            let sessionStatus: SessionStatus;
            try { sess = await getLiveSession(bk.id); } catch { sess = null; }
            if (sess && sess.status === "live") {
              sessionStatus = "live";
            } else if (slotMs > now) {
              sessionStatus = "upcoming";
            } else {
              sessionStatus = "completed";
            }
            items.push({ booking: bk, sessionStatus, session: sess });
            if (items.length >= 6) break;
          }
          setRecentItems(items);
        } catch { /* non-fatal */ }
        setRecentLoading(false);
      }
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
    <div className="center"><div style={{ fontSize: 40 }}>🩺</div><p style={{ color: "var(--muted)" }}>Loading available slots…</p></div>
  );
  if (!user) return <SignInForm title="Sign in to book" subtitle="Sign in to book your consultation securely." />;

  const daySlots = selDay ? byDay.get(selDay) ?? [] : [];
  const effectivePrice = discountApplied
    ? Math.round(settings.priceNGN * (1 - discountApplied.percent / 100))
    : settings.priceNGN;

  const validateDiscount = async () => {
    const raw = discountInput.trim().toUpperCase();
    if (!raw) return;
    setDiscountValidating(true);
    setDiscountError("");
    setDiscountApplied(null);
    try {
      const dc = await validateDiscountCode(raw, user?.email ?? "");
      if (!dc) setDiscountError("Invalid, expired, or not applicable to your account.");
      else setDiscountApplied({ id: dc.id, code: dc.code, percent: dc.percent });
    } catch { setDiscountError("Could not validate. Please try again."); }
    setDiscountValidating(false);
  };

  const pay = () => {
    if (!selSlot || !user || !consent) return;
    const email = user.email ?? "";
    if (!email.includes("@")) { alert("No email on your Google account. Sign out and try again."); return; }
    setStatus("paying");
    let createdId: string | null = null;
    createBooking({
      clientId: user.uid, clientName: user.displayName ?? "Client", clientEmail: email,
      slotStart: Timestamp.fromDate(selSlot.start), slotEnd: Timestamp.fromDate(selSlot.end),
      status: "held", topic, amountNGN: effectivePrice,
      ...(discountApplied && { discountCode: discountApplied.code, discountCodeId: discountApplied.id, discountPercent: discountApplied.percent }),
    }).then((id) => {
      createdId = id; setBookingId(id);
      payNGN({
        email, amountNGN: effectivePrice,
        metadata: { bookingId: id, kind: "session" },
        onSuccess: async (ref) => {
          try { if (API_BASE) await fetch(`${API_BASE}/verify?reference=${ref}`); } catch {}
          await markBookingPaid(id, ref);
          if (discountApplied) { try { await redeemDiscountCode(discountApplied.id, id); } catch {} }
          setStatus("booked");
        },
        onCancel: () => {
          if (createdId) cancelBooking(createdId).catch(() => {});
          setStatus("idle");
        },
        onError: () => {
          if (createdId) cancelBooking(createdId).catch(() => {});
          setStatus("idle");
          alert("Payment could not be completed. Your slot has been released. Please try again.");
        },
      });
    }).catch(() => setStatus("idle"));
  };

  if (status === "booked" && bookingId) {
    return (
      <div className="center" style={{ minHeight: "100vh" }}>
        <div style={{ fontSize: 56 }}>✅</div>
        <h2 style={{ color: "var(--teal)" }}>Consultation Confirmed!</h2>
        <p>
          {selSlot && <><strong>{fmtSlot(selSlot.start)}</strong><br/></>}
          A confirmation email is on its way. You can join at your appointment time.
        </p>
        <Link className="btn btn-primary btn-lg" href={`/session/?id=${bookingId}&role=client`}>🩺 Go to My Session Room</Link>
        <p style={{ marginTop: 14 }}><Link href="/" style={{ color: "var(--teal)", fontSize: 14 }}>← Back to Home</Link></p>
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
              <span>ConsultDrFat</span><small>Medical Consultations</small>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link href="/" className="btn btn-ghost btn-sm">← Home</Link>
            <button className="btn btn-ghost btn-sm" onClick={() => signOut()}>Sign Out</button>
          </div>
        </nav>

        <div className="page-head">
          <div className="lbl">🗓 Book a Consultation</div>
          <h2>Choose a time that works for you.</h2>
          <p>Available slots for the next {settings.bookingWindowDays} days — Mon–Sat. Select a day, pick a time, and confirm below.</p>
        </div>

        {/* ── RECENT SESSIONS PANEL ── */}
        {user && (
          <div className="recent-sessions-panel">
            <div className="recent-panel-header">
              <span className="recent-panel-title">🕐 Your Sessions</span>
              {recentLoading && <span className="recent-loading">Loading…</span>}
            </div>

            {!recentLoading && recentItems.length === 0 && (
              <div className="recent-empty">
                <span>📋</span>
                <span>No sessions yet — book your first consultation below.</span>
              </div>
            )}

            {recentItems.length > 0 && (
              <div className="recent-list">
                {recentItems.map(({ booking: bk, sessionStatus, session }) => {
                  const start = bk.slotStart.toDate();
                  const isLive = sessionStatus === "live";
                  const isUpcoming = sessionStatus === "upcoming";
                  const isDone = sessionStatus === "completed";
                  // Check if session was started but might be interruptible (idle but slot time already passed + within 2h)
                  const slotMs = bk.slotStart.toMillis();
                  const nowMs = Date.now();
                  const isResumable = !isLive && !isUpcoming && (nowMs - slotMs) < 2 * 60 * 60 * 1000;

                  return (
                    <div key={bk.id} className={`recent-row ${isLive ? "recent-live" : isUpcoming ? "recent-upcoming" : "recent-done"}`}>
                      <div className="recent-row-left">
                        {isLive && <span className="recent-live-dot" />}
                        <div className="recent-row-info">
                          <span className="recent-row-date">{fmtSlot(start)}</span>
                          {bk.topic && <span className="recent-row-topic">{bk.topic}</span>}
                        </div>
                      </div>
                      <div className="recent-row-right">
                        <span className={`recent-badge ${isLive ? "rb-live" : isUpcoming ? "rb-upcoming" : "rb-done"}`}>
                          {isLive ? "● Live" : isUpcoming ? "Upcoming" : "Completed"}
                        </span>
                        {isLive && (
                          <Link href={`/session/?id=${bk.id}&role=client`} className="btn btn-sm btn-primary">
                            Rejoin →
                          </Link>
                        )}
                        {isUpcoming && (
                          <Link href={`/session/?id=${bk.id}&role=client`} className="btn btn-sm btn-ghost">
                            Join Room →
                          </Link>
                        )}
                        {isResumable && !isLive && !isUpcoming && (
                          <Link href={`/session/?id=${bk.id}&role=client`} className="btn btn-sm btn-ghost" style={{ borderColor: "var(--gold)", color: "var(--gold)" }}>
                            Resume →
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── BOOKING GRID ── */}
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
            <div className="muted-h">{selDay ? `⏰ Available times — ${selDay}` : "Select a date to see times"}</div>
            <div className="slots">
              {daySlots.map((s) => {
                const t = s.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const sel = selSlot?.start.getTime() === s.start.getTime();
                return (
                  <div key={s.start.getTime()} className={"slot" + (sel ? " sel" : "")} onClick={() => setSelSlot(s)}>{t}</div>
                );
              })}
              {selDay && daySlots.length === 0 && (
                <p style={{ color: "var(--muted)", fontSize: 13.5, gridColumn: "1 / -1" }}>No open slots this day.</p>
              )}
            </div>
          </div>

          {/* Summary panel */}
          <div className="panel" style={{ minWidth: 0, overflow: "hidden" }}>
            <div className="panel-head"><h3>🩺 Your Consultation</h3></div>

            {/* Doctor card */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--line)", marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--teal-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>👨‍⚕️</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--navy)" }}>Dr. Fat</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>General Practitioner · MDCN Registered</div>
              </div>
            </div>

            <div className="sumline"><span className="ic">🗓</span>
              <span style={{ color: selSlot ? "var(--ink)" : "var(--muted)" }}>
                {selSlot ? fmtSlot(selSlot.start) : "No time selected yet"}
              </span>
            </div>
            <div className="sumline"><span className="ic">⏱</span><span>{settings.sessionLengthMin}-minute consultation · voice + chat</span></div>
            <div className="sumline"><span className="ic">🔒</span><span>Private &amp; encrypted session</span></div>

            {/* Discount code — accordion */}
            <div className="discount-accordion" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="discount-toggle"
                onClick={() => { setShowDiscount(v => !v); setDiscountError(""); }}
                aria-expanded={showDiscount}
              >
                <span>🏷 Have a discount code?</span>
                <span className="discount-chevron" style={{ transform: showDiscount ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
              </button>
              {showDiscount && (
                <div className="discount-body">
                  {!discountApplied ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        value={discountInput}
                        onChange={e => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(""); }}
                        placeholder="DRFAT-XXXX"
                        style={{ flex: 1, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}
                      />
                      <button type="button" className="btn btn-ghost btn-sm" onClick={validateDiscount} disabled={!discountInput.trim() || discountValidating} style={{ whiteSpace: "nowrap" }}>
                        {discountValidating ? "…" : "Apply"}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: "var(--teal)", fontWeight: 600, flex: 1 }}>
                        ✓ {discountApplied.percent}% off — pay {ngn(effectivePrice)} instead of {ngn(settings.priceNGN)}
                      </span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDiscountApplied(null); setDiscountInput(""); }} style={{ color: "var(--muted)" }}>Remove</button>
                    </div>
                  )}
                  {discountError && <p style={{ fontSize: 12, color: "#e05", marginTop: 6 }}>{discountError}</p>}
                </div>
              )}
            </div>

            {/* Topic */}
            <div style={{ marginTop: 14 }}>
              <label htmlFor="topic">What is your main concern? <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span></label>
              <textarea id="topic" rows={3} value={topic} onChange={e => setTopic(e.target.value)} placeholder="E.g. persistent cough, recurring headaches, high blood pressure…" />
            </div>

            {/* Consent */}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14, padding: "10px 12px", background: "var(--teal-pale)", borderRadius: 10, border: "1px solid var(--line)" }}>
              <input type="checkbox" id="consent" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 2, width: "auto", accentColor: "var(--teal)" }} />
              <label htmlFor="consent" style={{ fontSize: 12.5, color: "var(--muted)", cursor: "pointer", fontWeight: 400, margin: 0 }}>
                I consent to sharing my health information with Dr. Fat for the purpose of this medical consultation.
              </label>
            </div>

            <div className="price-row">
              <span style={{ fontSize: 14, color: "var(--muted)" }}>Consultation fee</span>
              <div style={{ textAlign: "right" }}>
                {discountApplied && <div style={{ fontSize: 12, color: "var(--muted)", textDecoration: "line-through" }}>{ngn(settings.priceNGN)}</div>}
                <span className="price">{ngn(effectivePrice)}</span>
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: "100%", marginTop: 14 }} disabled={!selSlot || !consent || status === "paying"} onClick={pay}>
              {status === "paying" ? "⏳ Opening secure checkout…"
                : selSlot && consent ? `💳 Pay ${ngn(effectivePrice)} & Confirm`
                : !selSlot ? "Select a time to continue"
                : "Please accept consent above"}
            </button>
            <div className="fine">
              💳 Card · Bank Transfer · OPay · PalmPay via Paystack
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
