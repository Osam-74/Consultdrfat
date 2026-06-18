"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  getSettings, getTemplates, getExceptions, getActiveBookings,
  getClientBookings, createBooking, markBookingPaid,
} from "@/lib/db";
import { generateSlots, groupByDay, Slot } from "@/lib/slots";
import { payNGN } from "@/lib/paystack";
import { API_BASE } from "@/lib/firebase";
import SignInForm from "@/components/SignInForm";
import { PracticeSettings, DEFAULT_SETTINGS, Booking } from "@/lib/types";
import { Timestamp } from "firebase/firestore";

const DOW   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MON   = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ngn   = (n: number) => new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(n);
const ymd   = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const fmtDT = (ts: Timestamp) => {
  const d = ts.toDate();
  return `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} · ${d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`;
};

function sessionLabel(b: Booking): { label: string; color: string; icon: string } {
  const now   = Date.now();
  const start = b.slotStart.toMillis();
  const end   = b.slotEnd.toMillis();

  if (b.status === "held")      return { label: "Awaiting payment", color: "#C8963A", icon: "⏳" };
  if (now < start - 15 * 60_000) return { label: "Upcoming",        color: "#0E8A7A", icon: "📅" };
  if (now >= start - 15 * 60_000 && now <= end + 60 * 60_000)
                                 return { label: "Join now",         color: "#1a7a4a", icon: "🟢" };
  return                               { label: "Completed",         color: "#7A8A98", icon: "✅" };
}

// ── Reusable session card ──────────────────────────────────────────────────────
function SessionCard({ b, currentUserId }: { b: Booking; currentUserId: string }) {
  const { label, color, icon } = sessionLabel(b);
  const now    = Date.now();
  const start  = b.slotStart.toMillis();
  const end    = b.slotEnd.toMillis();
  // Joinable window: 15 min before until 1 hr after scheduled end
  const canJoin = b.status === "paid" && now >= start - 15 * 60_000 && now <= end + 60 * 60_000;
  // Upcoming (not yet joinable) but paid — show "Get Ready"
  const upcoming = b.status === "paid" && now < start - 15 * 60_000;

  return (
    <div style={{
      background: "#fff",
      border: "1px solid var(--line)",
      borderRadius: 14,
      padding: "14px 18px",
      display: "flex",
      alignItems: "center",
      gap: 14,
      transition: "box-shadow .15s",
    }}>
      {/* Status dot */}
      <div style={{
        width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
        background: color + "18",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18,
      }}>{icon}</div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--navy)", marginBottom: 2 }}>
          {fmtDT(b.slotStart)}
        </div>
        {b.topic && (
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {b.topic}
          </div>
        )}
        <div style={{ fontSize: 11.5, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label}
        </div>
      </div>

      {/* Action */}
      {canJoin && (
        <Link
          href={`/session/?id=${b.id}&role=client`}
          style={{
            flexShrink: 0,
            background: "linear-gradient(135deg,#0E8A7A,#0B6A5A)",
            color: "#fff",
            borderRadius: 10,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
            whiteSpace: "nowrap",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          🚀 Join Session
        </Link>
      )}
      {upcoming && (
        <div style={{
          flexShrink: 0,
          background: "#F0FAF9",
          color: "#0E8A7A",
          border: "1px solid rgba(14,138,122,.25)",
          borderRadius: 10,
          padding: "8px 14px",
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}>
          Scheduled
        </div>
      )}
    </div>
  );
}


export default function BookPage() {
  const { user, loading } = useAuth();
  const [settings,    setSettings]    = useState<PracticeSettings>(DEFAULT_SETTINGS);
  const [slots,       setSlots]       = useState<Slot[]>([]);
  const [ready,       setReady]       = useState(false);
  const [selDay,      setSelDay]      = useState<string | null>(null);
  const [selSlot,     setSelSlot]     = useState<Slot | null>(null);
  const [topic,       setTopic]       = useState("");
  const [consent,     setConsent]     = useState(false);
  const [bookStatus,  setBookStatus]  = useState<"idle"|"paying"|"booked">("idle");
  const [bookingId,   setBookingId]   = useState<string | null>(null);
  const [myBookings,  setMyBookings]  = useState<Booking[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Load slots
  useEffect(() => {
    (async () => {
      const [s, t, e, b] = await Promise.all([getSettings(), getTemplates(), getExceptions(), getActiveBookings()]);
      setSettings(s);
      const taken = new Set(b.map((x) => x.slotStart.toMillis()));
      setSlots(generateSlots(s, t, e, taken));
      setReady(true);
    })().catch(() => setReady(true));
  }, []);

  // Load client's own bookings
  useEffect(() => {
    if (!user) return;
    setSessionsLoading(true);
    getClientBookings(user.uid, 6)
      .then((b) => setMyBookings(b))
      .catch(console.error)
      .finally(() => setSessionsLoading(false));
  }, [user]);

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

  // ── Loading / Auth guards ──────────────────────────────────────────────────
  if (loading || !ready) return (
    <div className="center" style={{ minHeight: "100vh" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🩺</div>
      <p style={{ color: "var(--muted)" }}>Loading available slots…</p>
    </div>
  );

  if (!user) return <SignInForm title="Sign in to book" subtitle="Sign in to book your consultation securely." />;

  const daySlots = selDay ? byDay.get(selDay) ?? [] : [];

  // ── Pay & book ────────────────────────────────────────────────────────────
  const pay = () => {
    if (!selSlot || !user || !consent) return;
    setBookStatus("paying");
    createBooking({
      clientId:   user.uid,
      clientName: user.displayName ?? "Client",
      clientEmail: user.email ?? "",
      slotStart:  Timestamp.fromDate(selSlot.start),
      slotEnd:    Timestamp.fromDate(selSlot.end),
      status:     "held",
      topic,
      amountNGN:  settings.priceNGN,
    }).then((id) => {
      setBookingId(id);
      payNGN({
        email: user.email ?? "",
        amountNGN: settings.priceNGN,
        metadata: { bookingId: id, kind: "session" },
        onSuccess: async (ref) => {
          try { if (API_BASE) await fetch(`${API_BASE}/verify?reference=${ref}`); } catch {}
          await markBookingPaid(id, ref);
          setBookStatus("booked");
          // Refresh sessions list
          getClientBookings(user.uid, 6).then(setMyBookings).catch(() => {});
        },
        onCancel: () => setBookStatus("idle"),
      });
    }).catch(() => setBookStatus("idle"));
  };

  // ── Booking confirmation screen ───────────────────────────────────────────
  if (bookStatus === "booked" && bookingId && selSlot) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--paper)", display: "flex", flexDirection: "column" }}>
        <div className="wrap">
          <nav className="nav">
            <div className="brand">
              <div className="brand-icon">🩺</div>
              <div className="brand-text"><span>ConsultDrFat</span><small>Booking Confirmed</small></div>
            </div>
            <Link href="/" className="btn btn-ghost btn-sm">← Home</Link>
          </nav>
        </div>
        <div className="center" style={{ flex: 1, padding: "40px 20px" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: "var(--teal)", margin: "0 0 8px" }}>Consultation Confirmed!</h2>
          <p style={{ color: "var(--muted)", fontSize: 15, maxWidth: 380, textAlign: "center", lineHeight: 1.7, margin: "0 0 8px" }}>
            <strong>
              {DOW[selSlot.start.getDay()]}, {selSlot.start.getDate()} {MON[selSlot.start.getMonth()]} — {selSlot.start.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
            </strong>
          </p>
          <p style={{ color: "var(--muted)", fontSize: 13.5, maxWidth: 380, textAlign: "center", lineHeight: 1.7, margin: "0 0 32px" }}>
            A confirmation email is on its way. Your session room will be ready 15 minutes before your appointment.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 340 }}>
            <Link className="btn btn-primary btn-lg" href={`/session/?id=${bookingId}&role=client`}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              🚀 Go to My Session Room
            </Link>
            <Link href="/book/"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: "#fff", border: "1px solid var(--line)", borderRadius: 12,
                padding: "12px 24px", color: "var(--navy)", fontWeight: 600, fontSize: 14,
                textDecoration: "none",
              }}>
              📅 View My Bookings
            </Link>
            <Link href="/"
              style={{
                textAlign: "center", color: "var(--teal)", fontSize: 13.5,
                textDecoration: "none", padding: "8px",
              }}>
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Main booking page ─────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <div className="wrap">
        <nav className="nav">
          <div className="brand">
            <div className="brand-icon">🩺</div>
            <div className="brand-text"><span>ConsultDrFat</span><small>Medical Consultations</small></div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Link href="/" className="btn btn-ghost btn-sm">← Home</Link>
          </div>
        </nav>

        <div className="page-head">
          <div className="lbl">🗓 Book a Consultation</div>
          <h2>Choose a time that works for you.</h2>
          <p>Available slots · Select a day, pick a time, and confirm your booking.</p>
        </div>

        <div className="book-grid">
          {/* ── LEFT: Calendar + slots ── */}
          <div>
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
                  const cls = "day"+(has?" has":" none")+(selDay===c.key?" sel":"");
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
                  const t = s.start.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
                  const sel = selSlot?.start.getTime() === s.start.getTime();
                  return (
                    <div key={s.start.getTime()} className={"slot"+(sel?" sel":"")} onClick={() => setSelSlot(s)}>{t}</div>
                  );
                })}
                {selDay && daySlots.length === 0 && (
                  <p style={{ color:"var(--muted)", fontSize:13.5, gridColumn:"1 / -1" }}>No open slots this day.</p>
                )}
              </div>
            </div>

            {/* ── My Sessions (below calendar) ── */}
            <div className="panel" style={{ marginTop: 20 }}>
              <div className="panel-head">
                <h3>🗂 My Recent Sessions</h3>
                {myBookings.length > 0 && (
                  <span className="windownote">{myBookings.length} session{myBookings.length !== 1 ? "s" : ""}</span>
                )}
              </div>

              {sessionsLoading && (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)", fontSize: 13.5 }}>
                  Loading your sessions…
                </div>
              )}

              {!sessionsLoading && myBookings.length === 0 && (
                <div style={{
                  textAlign: "center", padding: "28px 16px",
                  color: "var(--muted)", fontSize: 13.5, lineHeight: 1.7,
                }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                  <strong style={{ display: "block", color: "var(--navy)", marginBottom: 4 }}>No sessions yet</strong>
                  Book your first consultation using the calendar above.
                </div>
              )}

              {!sessionsLoading && myBookings.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {myBookings.map((b) => (
                    <SessionCard key={b.id} b={b} currentUserId={user.uid} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Summary + booking form ── */}
          <div className="panel">
            <div className="panel-head"><h3>🩺 Your Consultation</h3></div>

            {/* Doctor card */}
            <div style={{ display:"flex", gap:12, alignItems:"center", padding:"12px 0", borderBottom:"1px solid var(--line)", marginBottom:16 }}>
              <div style={{ width:44,height:44,borderRadius:"50%",background:"var(--teal-soft)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0 }}>👨‍⚕️</div>
              <div>
                <div style={{ fontWeight:700, fontSize:14.5, color:"var(--navy)" }}>Dr. Fat</div>
                <div style={{ fontSize:12, color:"var(--muted)" }}>General Practitioner · MDCN Registered</div>
              </div>
            </div>

            <div className="sumline">
              <span className="ic">🗓</span>
              <span style={{ color: selSlot ? "var(--ink)" : "var(--muted)" }}>
                {selSlot
                  ? `${DOW[selSlot.start.getDay()]}, ${selSlot.start.getDate()} ${MON[selSlot.start.getMonth()]} · ${selSlot.start.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`
                  : "No time selected yet"}
              </span>
            </div>
            <div className="sumline"><span className="ic">⏱</span><span>{settings.sessionLengthMin}-minute consultation · voice + chat</span></div>
            <div className="sumline"><span className="ic">🔒</span><span>Private &amp; encrypted session</span></div>

            <div style={{ marginTop:12 }}>
              <label htmlFor="topic">
                What is your main concern? <span style={{ color:"var(--muted)", fontWeight:400 }}>(optional)</span>
              </label>
              <textarea id="topic" rows={3} value={topic} onChange={(e) => setTopic(e.target.value)}
                placeholder="E.g. persistent cough for 2 weeks, recurring headaches…"
                style={{ resize:"none" }}
              />
            </div>

            <label className="check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>I confirm I am 18+ and agree to the <Link href="/terms/">terms of service</Link> and <Link href="/privacy/">privacy policy</Link>.</span>
            </label>

            <div style={{ marginTop:8, background:"var(--teal-soft)", borderRadius:10, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:13, color:"var(--teal)", fontWeight:600 }}>Consultation fee</span>
              <span style={{ fontSize:18, fontWeight:800, color:"var(--navy)" }}>{ngn(settings.priceNGN)}</span>
            </div>

            <button className="btn btn-primary btn-lg" style={{ marginTop:16, width:"100%" }}
              disabled={!selSlot || !consent || bookStatus === "paying"}
              onClick={pay}>
              {bookStatus === "paying" ? "⏳ Opening payment…" : `💳 Pay ${ngn(settings.priceNGN)} & Confirm`}
            </button>

            {!selSlot && (
              <p style={{ textAlign:"center", fontSize:12.5, color:"var(--muted)", marginTop:10 }}>← Select a date and time first</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
