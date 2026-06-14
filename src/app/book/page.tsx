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

  // 21-cell grid starting on the Sunday of this week
  const cells = useMemo(() => {
    const now = new Date(); now.setHours(0,0,0,0);
    const start = new Date(now); start.setDate(now.getDate() - now.getDay());
    const windowEnd = new Date(now); windowEnd.setDate(now.getDate() + settings.bookingWindowDays);
    return Array.from({ length: 21 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i); d.setHours(0,0,0,0);
      return { date: d, key: ymd(d), past: d < now, beyond: d >= windowEnd };
    });
  }, [settings.bookingWindowDays]);

  if (loading || !ready) return <div className="center"><p>Loading…</p></div>;

  if (!user) {
    return (
      <div className="center">
        <h2>Sign in to book</h2>
        <p>We use your Google account to secure your session and send confirmations.</p>
        <button className="btn btn-amber" onClick={() => signIn()}>Continue with Google</button>
        <p style={{ marginTop: 18 }}><Link href="/">← Back</Link></p>
      </div>
    );
  }

  const daySlots = selDay ? byDay.get(selDay) ?? [] : [];

  const pay = () => {
    if (!selSlot || !user) return;
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
          // Verify server-side before trusting payment.
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
      <div className="center">
        <h2>You’re booked 🎉</h2>
        <p>
          {selSlot && `${DOW[selSlot.start.getDay()]} ${selSlot.start.getDate()} ${MON[selSlot.start.getMonth()]} · ${selSlot.start.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`}
          . We’ll send a reminder before your session.
        </p>
        <Link className="btn btn-amber" href={`/session/?id=${bookingId}&role=client`}>Go to my session room</Link>
        <p style={{ marginTop: 18 }}><Link href="/">← Home</Link></p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand"><span className="m">M</span>MindBridge</div>
        <Link href="/" className="btn btn-ghost" style={{ padding: "8px 16px" }}>Home</Link>
      </div>
      <div className="page-head">
        <div className="lbl">Book a session</div>
        <h2>Choose a time that suits you.</h2>
        <p>Open times for the next {settings.bookingWindowDays} days. Anything further out opens up as the days roll forward.</p>
      </div>

      <div className="book-grid">
        <div className="panel">
          <div className="panel-head">
            <h3>Next two weeks</h3>
            <span className="windownote">Booking window · {settings.bookingWindowDays} days</span>
          </div>
          <div className="cal">
            {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
            {cells.map((c) => {
              if (c.past) return <div key={c.key} className="day empty" />;
              if (c.beyond) return <div key={c.key} className="day locked"><span className="mon">{MON[c.date.getMonth()]}</span>{c.date.getDate()}🔒</div>;
              const has = byDay.has(c.key);
              const cls = "day" + (has ? " has" : " none") + (selDay === c.key ? " sel" : "");
              return (
                <div key={c.key} className={cls} onClick={() => has && (setSelDay(c.key), setSelSlot(null))}>
                  <span className="mon">{MON[c.date.getMonth()]}</span>{c.date.getDate()}
                </div>
              );
            })}
          </div>
          <div className="muted-h">{selDay ? `Times for ${selDay}` : "Select a day to see times"}</div>
          <div className="slots">
            {daySlots.map((s) => {
              const t = s.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              const sel = selSlot?.start.getTime() === s.start.getTime();
              return <div key={s.start.getTime()} className={"slot" + (sel ? " sel" : "")} onClick={() => setSelSlot(s)}>{t}</div>;
            })}
            {selDay && daySlots.length === 0 && <p style={{ color: "var(--muted)", fontSize: 14 }}>No open times this day.</p>}
          </div>
        </div>

        <div className="panel">
          <h3>Your session</h3>
          <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "4px 0 16px" }}>Review and confirm.</p>
          <div className="sumline"><span className="ic">◷</span>
            <span style={{ color: selSlot ? "var(--ink)" : "var(--muted)" }}>
              {selSlot ? `${DOW[selSlot.start.getDay()]} ${selSlot.start.getDate()} ${MON[selSlot.start.getMonth()]} · ${selSlot.start.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}` : "No time selected yet"}
            </span>
          </div>
          <div className="sumline"><span className="ic">◐</span><span>{settings.sessionLengthMin}-minute session · voice or chat</span></div>
          <label className="lab" htmlFor="topic">What would you like to talk about? (optional)</label>
          <textarea id="topic" rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="One or two things on your mind…" />
          <div className="price-row"><span style={{ fontSize: 14, color: "var(--muted)" }}>Session fee</span><span className="price">{ngn(settings.priceNGN)}</span></div>
          <button className="btn btn-amber" style={{ width: "100%", marginTop: 14 }} disabled={!selSlot || status === "paying"} onClick={pay}>
            {status === "paying" ? "Opening secure checkout…" : selSlot ? `Pay ${ngn(settings.priceNGN)} & confirm` : "Select a time to continue"}
          </button>
          <div className="fine">Card · bank transfer · OPay · PalmPay — via Paystack. Free cancellation up to 24h before.</div>
        </div>
      </div>
    </div>
  );
}
