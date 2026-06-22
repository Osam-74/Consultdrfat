"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  getSettings, saveSettings, getTemplates, saveTemplate, deleteTemplate,
  getExceptions, addException, deleteException, watchBookings, ensurePractitionerConfig,
  archiveBooking, watchDiscountCodes, deleteBookingPermanently, unarchiveBooking,
} from "@/lib/db";
import type { DiscountCode } from "@/lib/db";
import {
  PracticeSettings, DEFAULT_SETTINGS, AvailabilityTemplate, AvailabilityException, Booking,
} from "@/lib/types";
import SignInForm from "@/components/SignInForm";

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ngn = (n: number) => new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(n);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const DOW_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MON_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDate = (s: string) => { const d=new Date(s+"T00:00:00"); return `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
const fmtDT = (d: Date) => `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} · ${d.toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"})}`;

function addDays(d: Date, n: number): Date { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function calCells(base: Date): Date[] {
  const start=new Date(base); start.setDate(1);
  const cells: Date[]=[];
  for(let i=0;i<start.getDay();i++) cells.push(addDays(start,i-start.getDay()));
  const dim=new Date(base.getFullYear(),base.getMonth()+1,0).getDate();
  for(let i=0;i<dim;i++) cells.push(addDays(start,i));
  while(cells.length%7!==0) cells.push(addDays(cells[cells.length-1],1));
  return cells;
}

const BrandNav = ({ onSignOut }: {
  onSignOut: () => void;
}) => (
  <nav className="nav" style={{borderBottom:"1px solid var(--line)",marginBottom:4}}>
    <Link href="/" style={{textDecoration:"none",display:"flex",alignItems:"center",gap:10}} className="brand">
      <div className="brand-icon">🩺</div>
      <div className="brand-text"><span>ConsultDrFat</span><small>Practitioner Portal</small></div>
    </Link>
    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
      <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign Out</button>
    </div>
  </nav>
);

// ── Compact booking card with accordion expand ──────────────────────────────
function BookingCard({ b, onArchive, onPermanentDelete, onUnarchive, filterMode, sessionStatus }: {
  b: Booking;
  onArchive: (id: string) => void;
  onPermanentDelete?: (id: string) => void;
  onUnarchive?: (id: string) => void;
  filterMode?: "upcoming" | "past" | "archived";
  sessionStatus?: string;
}) {
  const [open, setOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const d = b.slotStart.toDate();
  const end = b.slotEnd.toDate();
  const isPast = d < new Date();
  const isLive = !isPast && (Date.now() - d.getTime()) > -5 * 60 * 1000 && (d.getTime() - Date.now()) < 90 * 60 * 1000;

  return (
    <div className={"booking-row" + (isPast ? " brow-past" : isLive ? " brow-live" : "")}>
      {/* Collapsed row */}
      <div className="booking-row-main" onClick={() => setOpen(v => !v)}>
        <div className="brow-date-badge">
          <span className="brow-day">{d.getDate()}</span>
          <span className="brow-mon">{MON[d.getMonth()]}</span>
        </div>
        <div className="brow-summary">
          <span className="brow-name">{b.clientName}</span>
          <span className="brow-time">{d.toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"})} – {end.toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"})}</span>
        </div>
        <div className="brow-meta">
          {(() => {
            const ss = sessionStatus ?? "none";
            const now = new Date();
            if (b.status === "cancelled") return <span className="status-pill pill-cancelled">Cancelled</span>;
            if (b.status === "held") return <span className="status-pill pill-held">Pending</span>;
            if (b.archived && ss === "complete") return <span className="status-pill pill-completed">Completed</span>;
            if (ss === "complete") return <span className="status-pill pill-completed">Completed</span>;
            if (b.archived && b.slotStart.toDate() < now) return <span className="status-pill pill-noshown">No-Show</span>;
            if (b.status === "paid" && b.slotStart.toDate() < now && ss !== "complete" && !b.archived) {
              return <span className="status-pill pill-noshown">No-Show</span>;
            }
            return <span className="status-pill pill-confirmed">Confirmed</span>;
          })()}
          <span className="brow-amount">{ngn(b.amountNGN)}</span>
        </div>
        <span className="brow-chevron" style={{transform: open ? "rotate(180deg)" : "none"}}>▾</span>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="booking-row-detail">
          {b.clientEmail && <div className="brow-detail-line">✉️ <span>{b.clientEmail}</span></div>}
          {b.topic && <div className="brow-detail-line">💬 <span>{b.topic}</span></div>}
          {b.paystackRef && <div className="brow-detail-line">🧾 <span style={{fontSize:12,fontFamily:"monospace"}}>{b.paystackRef}</span></div>}
          {b.discountCode && <div className="brow-detail-line">🏷 <span>{b.discountCode} ({b.discountPercent}% off)</span></div>}
          <div className="brow-detail-line">🗓 <span>{fmtDT(d)} — {end.toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"})}</span></div>
          <div className="brow-detail-actions">
            {b.status === "paid" && !b.archived && filterMode !== "past" && (
              <Link className="btn btn-sm btn-primary" href={`/session/?id=${b.id}&role=practitioner`}>
                🚀 Start Session
              </Link>
            )}
            {!b.archived && filterMode !== "past" && (
              <button className="btn btn-sm btn-ghost" style={{color:"var(--muted)"}} disabled={archiving}
                onClick={async () => { setArchiving(true); await onArchive(b.id); }}>
                {archiving ? "…" : "🗄 Archive"}
              </button>
            )}
            {filterMode === "archived" && onUnarchive && (
              <button className="btn btn-sm btn-ghost" style={{color:"var(--teal)"}} disabled={archiving}
                onClick={async () => { setArchiving(true); await onUnarchive(b.id); }}>
                {archiving ? "…" : "↩️ Restore"}
              </button>
            )}
            {filterMode === "archived" && onPermanentDelete && (
              <button className="btn btn-sm btn-ghost" style={{color:"#ef4444"}} disabled={deleting}
                onClick={async () => { setDeleting(true); await onPermanentDelete(b.id); }}>
                {deleting ? "…" : "🗑 Delete permanently"}
              </button>
            )}
            {filterMode === "past" && !b.archived && (
              <button className="btn btn-sm btn-ghost" style={{color:"var(--muted)"}} disabled={archiving}
                onClick={async () => { setArchiving(true); await onArchive(b.id); }}>
                {archiving ? "…" : "🗄 Archive"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
export default function AdminPage() {
  const { user, role, loading, signOut } = useAuth();
  const [tab, setTab]               = useState<"availability"|"bookings"|"clients"|"discounts"|"settings">("availability");
  const [earningsFilter, setEarningsFilter] = useState<"week"|"month">("month");
  const [earningsFrom, setEarningsFrom] = useState("");
  const [earningsTo, setEarningsTo]   = useState("");
  const [settings, setSettings]     = useState<PracticeSettings>(DEFAULT_SETTINGS);
  const [templates, setTemplates]   = useState<AvailabilityTemplate[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [bookings, setBookings]     = useState<Booking[]>([]);
  const [sessionStatuses, setSessionStatuses] = useState<Record<string, "none"|"idle"|"live"|"complete">>({});
  const [discountCodes, setDiscountCodes]       = useState<DiscountCode[]>([]);
  const [saving, setSaving]         = useState(false);
  const [clearing, setClearing]     = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearStep, setClearStep]   = useState<"idle"|"backup"|"delete"|"done">("idle");
  const [clearProgress, setClearProgress] = useState("");
  // Horizontal calendar date picker for bookings tab
  const [calSelectedDate, setCalSelectedDate] = useState<string>(ymd(new Date()));
  const [bookingsFilter, setBookingsFilter] = useState<"upcoming"|"past"|"archived">("upcoming");
  const [calScrollStart, setCalScrollStart] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 3);
    return ymd(d);
  });
  const calStripRef = useRef<HTMLDivElement>(null);
  const calDays = useMemo(() => {
    const start = new Date(calScrollStart + "T00:00:00");
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [calScrollStart]);

  // Waiting room
  const [waitingRoom, setWaitingRoom] = useState<Booking[]>([]);
  const [waitingSessions, setWaitingSessions] = useState<Record<string, string>>({});
  const [waitingRoomOpen, setWaitingRoomOpen] = useState(false);

  // ── Client ping notification ──
  const [pingNotification, setPingNotification] = useState<{ name: string; bookingId: string; time: number } | null>(null);
  const lastPingSeenRef = useRef<Record<string, number>>({});
  const pingAudioRef = useRef<HTMLAudioElement | null>(null);

  // Availability calendar
  const today = useMemo(() => { const d=new Date(); d.setHours(0,0,0,0); return d; }, []);
  const [calMonth, setCalMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selDate, setSelDate]   = useState<string|null>(null);
  const [addWin, setAddWin]     = useState({ start:"09:00", end:"17:00" });
  const [addingDay, setAddingDay] = useState<number | null>(null);
  const [newWinStart, setNewWinStart] = useState("09:00");
  const [newWinEnd, setNewWinEnd] = useState("17:00");
  const [saving2, setSaving2]   = useState(false);

  const refresh = useCallback(async () => {
    setSettings(await getSettings());
    setTemplates(await getTemplates());
    setExceptions(await getExceptions());
  }, []);

  useEffect(() => {
    if (role === "practitioner" && user) {
      ensurePractitionerConfig(user.uid).catch(console.warn);
      refresh();
    }
  }, [role, user, refresh]);

  // Watch discount codes (practitioner only)
  useEffect(() => {
    if (role !== "practitioner") return;
    return watchDiscountCodes(setDiscountCodes);
  }, [role]);

  useEffect(() => {
    if (role !== "practitioner") return;
    // Single listener — sessionStatus is embedded on the booking doc (set by startSession/completeSession).
    // No secondary getSessionStatus() reads needed. Waiting room is derived from the same snapshot.
    return watchBookings((rows) => {
      setBookings(rows);
      // Build session statuses from the embedded field (no extra reads)
      const statuses: Record<string, "idle" | "live" | "complete" | "none"> = {};
      rows.forEach(b => {
        if (b.status === "paid" && !b.archived) {
          const ss = (b as unknown as Record<string, unknown>).sessionStatus as string;
          statuses[b.id] = (ss === "live" || ss === "complete" || ss === "none") ? ss : "idle";
        }
      });
      setSessionStatuses(statuses);
      // Derive waiting room from same snapshot — paid, not archived, not in session,
      // within 2h window. ALSO include pinged clients (clientPing within last 5 min)
      // even if they're slightly outside the window — they're actively waiting.
      const freshNow = Date.now();
      const windowStart = freshNow - 30 * 60 * 1000;
      const windowEnd   = freshNow + 2 * 60 * 60 * 1000;
      const waiting = rows.filter(b => {
        const ms = b.slotStart.toMillis();
        const pingTime = (b as unknown as Record<string, unknown>).clientPing as number | undefined;
        const hasFreshPing = pingTime && typeof pingTime === "number" && (freshNow - pingTime) < 5 * 60 * 1000;
        // Show if: paid, not archived, not already in a live session, and either
        // within the time window OR has a fresh ping (actively waiting right now)
        return b.status === "paid" && !b.archived && !b.inSession &&
          (ms >= windowStart && ms <= windowEnd || hasFreshPing);
      });
      setWaitingRoom(waiting);
      const ws: Record<string, "idle" | "live" | "complete" | "none"> = {};
      waiting.forEach(b => { ws[b.id] = statuses[b.id] || "idle"; });
      setWaitingSessions(ws);

      // ── Detect client pings ──
      // A ping is "fresh" if clientPing timestamp is within the last 60 seconds
      // and we haven't already shown this ping.
      const nowMs = Date.now();
      rows.forEach(b => {
        const pingTime = (b as unknown as Record<string, unknown>).clientPing as number | undefined;
        if (!pingTime || typeof pingTime !== "number") return;
        if (nowMs - pingTime > 60_000) return; // stale ping
        const lastSeen = lastPingSeenRef.current[b.id] ?? 0;
        if (pingTime > lastSeen) {
          lastPingSeenRef.current[b.id] = pingTime;
          setPingNotification({ name: b.clientName ?? "A client", bookingId: b.id, time: pingTime });
          // Play ping sound
          playPingSound();
        }
      });
    });
  }, [role]);

  const handleArchive = async (id: string) => {
    await archiveBooking(id);
  };
  const handlePermanentDelete = async (id: string) => {
    if (!confirm("Permanently delete this booking? This cannot be undone.")) return;
    await deleteBookingPermanently(id);
  };
  const handleUnarchive = async (id: string) => {
    await unarchiveBooking(id);
  };

  const windowsByDate = useMemo(() => {
    const map = new Map<string, AvailabilityTemplate[]>();
    templates.forEach(t => {
      if (!t.active) return;
      for (let i=0; i<=60; i++) {
        const d = addDays(today, i);
        if (d.getDay() === t.weekday) {
          const key = ymd(d);
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(t);
        }
      }
    });
    return map;
  }, [templates, today]);

  const extraByDate = useMemo(() => {
    const map = new Map<string, AvailabilityException[]>();
    exceptions.forEach(e => { if (!map.has(e.date)) map.set(e.date, []); map.get(e.date)!.push(e); });
    return map;
  }, [exceptions]);

  const isBlocked = (ds: string) => (extraByDate.get(ds)??[]).some(e=>e.type==="block");
  const extraWindows = (ds: string) => (extraByDate.get(ds)??[]).filter(e=>e.type==="extra");
  const recurringWindows = (ds: string) => windowsByDate.get(ds)??[];
  const hasWindows = (ds: string) => { if(isBlocked(ds)) return false; return recurringWindows(ds).length>0||extraWindows(ds).length>0; };

  // ── Ping sound ──
  const playPingSound = () => {
    try {
      // Generate a simple notification tone using Web Audio API
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      oscillator.frequency.setValueAtTime(1320, audioCtx.currentTime + 0.15); // E6
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch { /* non-fatal */ }
  };

  // Auto-dismiss ping notification after 15 seconds
  useEffect(() => {
    if (!pingNotification) return;
    const timer = setTimeout(() => setPingNotification(null), 15_000);
    return () => clearTimeout(timer);
  }, [pingNotification]);

  if (loading) return <div className="center" style={{minHeight:"100vh"}}><div style={{fontSize:40}}>🩺</div><p style={{color:"var(--muted)"}}>Loading…</p></div>;
  if (!user) return <SignInForm title="Practitioner Sign In" subtitle="Sign in to access your practitioner dashboard." />;
  if (role !== "practitioner") return (
    <div className="center" style={{minHeight:"100vh"}}>
      <div style={{fontSize:52}}>🚫</div>
      <h2>Access Restricted</h2>
      <p>This area is for the practitioner only.</p>
      <Link className="btn btn-primary" href="/book/">📅 Book a Consultation Instead</Link>
    </div>
  );

  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0,0,0,0);
  const startOfWeek  = new Date(startOfToday); startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());

  const nonArchived = bookings.filter(b => !b.archived);
  // All bookings ever (including archived) for earnings — never reduce on archive
  const allPaid = bookings.filter(b => b.status === "paid");

  // Upcoming = paid, not archived, slot is in the future (> now), not complete
  const nowTs = new Date();
  const upcoming = nonArchived.filter(b =>
    b.status === "paid" &&
    b.slotStart.toDate() > nowTs &&
    (sessionStatuses[b.id] ?? "none") !== "complete"
  );
  // Completed = session doc is "complete" (but not yet archived by practitioner)
  const completedNotArchived = nonArchived.filter(b =>
    b.status === "paid" && (sessionStatuses[b.id] ?? "none") === "complete"
  );

  // Bookings today/this week — count ALL paid non-archived bookings in the
  // time window, regardless of session status (upcoming + completed + in-progress)
  const endOfToday = new Date(startOfToday.getTime() + 86400000);
  const bookingsToday = nonArchived.filter(b =>
    b.status === "paid" &&
    b.slotStart.toDate() >= startOfToday &&
    b.slotStart.toDate() < endOfToday
  ).length;
  const bookingsThisWeek = nonArchived.filter(b =>
    b.status === "paid" &&
    b.slotStart.toDate() >= startOfWeek
  ).length;

  const upcomingToday = bookingsToday;
  const upcomingThisWeek = bookingsThisWeek;
  // Completed count = archived paid bookings + completed-but-not-archived
  const completedCount = bookings.filter(b => b.archived && b.status === "paid").length
    + completedNotArchived.length
    + bookings.filter(b => b.status === "paid" && b.completedAt && !b.archived && (sessionStatuses[b.id] ?? "none") !== "complete").length;

  // Earnings from ALL paid bookings — never reduced by archiving
  const totalEarnings = allPaid.reduce((a, b) => a + b.amountNGN, 0);

  // ── Consultation hours: total duration of all completed sessions ──
  // Uses completedAt - session start (slotStart) for each completed session.
  // Falls back to sessionLengthMin * 60s if completedAt is missing.
  // Includes both active and archived completed sessions.
  const consultationHours = (() => {
    const completed = bookings.filter(b =>
      b.status === "paid" &&
      ((sessionStatuses[b.id] ?? "none") === "complete" || (b.archived && b.completedAt))
    );
    let totalSeconds = 0;
    completed.forEach(b => {
      const startMs = b.slotStart.toMillis();
      // Use completedAt if available; otherwise use slotStart + sessionLengthMin
      // Also check for extension minutes from the session offer
      const extMin = (b as unknown as Record<string, unknown>).extensionMinutes as number | undefined;
      const baseMin = extMin ? settings.sessionLengthMin + extMin : settings.sessionLengthMin;
      const endMs = b.completedAt ? b.completedAt.toMillis() : startMs + (baseMin * 60_000);
      const durSec = Math.max(0, Math.round((endMs - startMs) / 1000));
      totalSeconds += durSec;
    });
    // Always show with 1 decimal place (e.g. 0.3, 1.5, 2.0)
    // This ensures even short sessions are visible
    const hrs = totalSeconds / 3600;
    return Math.round(hrs * 10) / 10;
  })();

  // ── Active patients: unique clientIds who have made bookings ──
  const activePatients = new Set(
    bookings.filter(b => b.status === "paid" && b.clientId).map(b => b.clientId)
  ).size;

  // ── Ping count: number of fresh pings (within last 5 minutes) ──
  const pingCount = bookings.filter(b => {
    const pingTime = (b as unknown as Record<string, unknown>).clientPing as number | undefined;
    return pingTime && typeof pingTime === "number" && (Date.now() - pingTime) < 5 * 60 * 1000;
  }).length;

  // Earnings chart data
  const now2 = new Date();
  const earningsChartData = (() => {
    const labels: string[] = [];
    const values: number[] = [];
    if (earningsFilter === "week") {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now2); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
        const next = new Date(d); next.setDate(d.getDate() + 1);
        labels.push(DOW[d.getDay()]);
        values.push(allPaid.filter(b => {
          const ms = b.slotStart.toMillis();
          return ms >= d.getTime() && ms < next.getTime();
        }).reduce((a, b) => a + b.amountNGN, 0));
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now2.getFullYear(), now2.getMonth() - i, 1);
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        labels.push(MON[d.getMonth()]);
        values.push(allPaid.filter(b => {
          const ms = b.slotStart.toMillis();
          return ms >= d.getTime() && ms < next.getTime();
        }).reduce((a, b) => a + b.amountNGN, 0));
      }
    }
    // Apply custom date range if set
    if (earningsFrom && earningsTo) {
      const from = new Date(earningsFrom).getTime();
      const to = new Date(earningsTo).getTime() + 86400000;
      const custom = allPaid.filter(b => { const ms = b.slotStart.toMillis(); return ms >= from && ms < to; });
      return { labels: ["Custom range"], values: [custom.reduce((a,b)=>a+b.amountNGN,0)], max: custom.reduce((a,b)=>a+b.amountNGN,0)||1 };
    }
    return { labels, values, max: Math.max(...values, 1) };
  })();

  const cells = calCells(calMonth);
  const monthLabel = `${MON[calMonth.getMonth()]} ${calMonth.getFullYear()}`;
  const selRecurring = selDate ? recurringWindows(selDate) : [];
  const selExtra     = selDate ? extraWindows(selDate) : [];
  const selBlocked   = selDate ? isBlocked(selDate) : false;


  return (
    <div style={{minHeight:"100vh",background:"var(--paper)"}}>
      <div className="wrap">
        <BrandNav onSignOut={signOut} />

        {/* ── Ping notification banner ── */}
        {pingNotification && (
          <div style={{
            position:"fixed",top:14,right:14,zIndex:10000,
            background:"linear-gradient(135deg,#0E8A7A,#0B2B4A)",
            color:"#fff",borderRadius:12,padding:"10px 14px",
            boxShadow:"0 6px 24px rgba(14,138,122,.35)",maxWidth:300,
            display:"flex",alignItems:"center",gap:10,
            animation:"fadeSlideUp .25s ease",
          }}>
            <span style={{fontSize:20,flexShrink:0,animation:"bellDangle .5s ease-in-out infinite alternate",display:"inline-block",transformOrigin:"top center"}}>🔔</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{pingNotification.name} is waiting</div>
            </div>
            <Link href={`/session/?id=${pingNotification.bookingId}&role=practitioner`}
              style={{
                background:"rgba(255,255,255,.22)",color:"#fff",
                borderRadius:7,padding:"5px 10px",fontSize:12,fontWeight:700,
                textDecoration:"none",whiteSpace:"nowrap",flexShrink:0,
              }}>
              Start
            </Link>
            <button onClick={()=>setPingNotification(null)}
              style={{background:"none",border:"none",color:"rgba(255,255,255,.55)",cursor:"pointer",fontSize:16,padding:0,flexShrink:0}}>×</button>
          </div>
        )}

        {/* ── Return to active session banner ── */}
        {(() => {
          const activeSession = bookings.find(b =>
            b.status === "paid" && !b.archived &&
            sessionStatuses[b.id] === "live"
          );
          if (!activeSession) return null;
          return (
            <Link
              href={`/session/?id=${activeSession.id}&role=practitioner`}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                textDecoration: "none",
                background: "linear-gradient(135deg,#dc2626,#991b1b)",
                color: "#fff", borderRadius: 16, padding: "14px 20px",
                marginBottom: 14, boxShadow: "0 4px 16px rgba(220,38,38,.3)",
                transition: "all .2s", cursor: "pointer",
              }}
            >
              <span style={{
                width: 10, height: 10, borderRadius: "50%",
                background: "#fff", display: "inline-block", flexShrink: 0,
                animation: "pingBlink 1s infinite",
              }} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>🔴 Session in progress</span>
              <span style={{ fontSize: 12, opacity: 0.9, marginLeft: "auto", whiteSpace: "nowrap" }}>
                Return to session →
              </span>
            </Link>
          );
        })()}


        {/* ── Waiting Room Bar ── */}
        {(() => {
          const now_ = Date.now();
          const hasFreshPing = waitingRoom.some(b => {
            const pt = (b as unknown as Record<string, unknown>).clientPing as number | undefined;
            return pt && typeof pt === "number" && (now_ - pt) < 5 * 60 * 1000;
          });
          const hasClients = waitingRoom.length > 0;
          return (
            <Link
              href="/waiting-room"
              style={{
                display:"flex", alignItems:"center", gap:10, width:"100%",
                textDecoration:"none",
                background: hasClients ? "linear-gradient(135deg,#0E8A7A,#0B2B4A)" : "#fff",
                color: hasClients ? "#fff" : "var(--navy)",
                border: hasClients ? "none" : "1px solid var(--line)",
                borderRadius:16, padding:"12px 18px",
                marginBottom:14, boxShadow:"var(--shadow-sm)",
                transition:"all .2s", cursor:"pointer", position:"relative",
              }}
            >
              {/* Pulsing dot — only when clients are present */}
              <span style={{
                width:10,height:10,borderRadius:"50%",flexShrink:0,
                background: hasClients ? "#fff" : "var(--muted)",
                animation: hasClients ? "wrPulse 1.5s ease-in-out infinite" : "none",
                boxShadow: hasClients ? "0 0 0 3px rgba(255,255,255,.25)" : "none",
                transition:"all .3s",
              }} />
              <span style={{fontWeight:700,fontSize:14,flex:1}}>Waiting Room</span>
              {hasClients ? (
                <span style={{
                  fontSize:12, fontWeight:700,
                  background:"rgba(255,255,255,.2)",
                  color:"#fff", borderRadius:999, padding:"2px 10px",
                }}>
                  {waitingRoom.length} waiting
                </span>
              ) : (
                <span style={{fontSize:12,color:"var(--muted)"}}>No clients waiting</span>
              )}
              {/* Bell icon — dangles for 5 min on ping */}
              {hasFreshPing && (
                <span
                  style={{
                    fontSize:18,
                    animation:"bellDangle 0.5s ease-in-out infinite alternate",
                    transformOrigin:"top center",
                    display:"inline-block",
                    marginLeft:4,
                  }}
                  title="A client just pinged!"
                >🔔</span>
              )}
            </Link>
          );
        })()}

        {/* Stats grid — Upcoming full width on top, then 4 stats below in one row */}
        <div className="dash-stats-grid">
          {/* Upcoming — full width row, teal/navy gradient (unchanged) */}
          <div className="stat-card stat-card-wide stat-card-hero">
            <div className="stat-icon" style={{fontSize:32}}>📅</div>
            <div style={{flex:1}}>
              <div className="stat-val" style={{color:"#fff",fontSize:36}}>{upcoming.length}</div>
              <div className="stat-lbl" style={{color:"rgba(255,255,255,.75)"}}>Upcoming Sessions</div>
              <div className="stat-summary" style={{color:"rgba(255,255,255,.55)"}}>
                {bookingsToday} booking{bookingsToday!==1?"s":""} today &nbsp;·&nbsp; {bookingsThisWeek} this week
              </div>
            </div>
          </div>

          {/* Row 2: 3 stats in one row — icon left, text left (horizontal layout) */}
          {/* Completed */}
          <div className="stat-card" style={{background:"#E8F6F4",borderColor:"#BFE7E1",display:"flex",alignItems:"center",gap:12}}>
            <div className="stat-icon" style={{fontSize:24,marginBottom:0,flexShrink:0}}>✅</div>
            <div style={{minWidth:0}}>
              <div className="stat-val" style={{color:"var(--navy)"}}>{completedCount}</div>
              <div className="stat-lbl">Completed Sessions</div>
            </div>
          </div>
          {/* Consultation Hours — total duration of all completed sessions */}
          <div className="stat-card" style={{background:"#E0F2F0",borderColor:"#A8DDD6",display:"flex",alignItems:"center",gap:12}}>
            <div className="stat-icon" style={{fontSize:24,marginBottom:0,flexShrink:0}}>⏱️</div>
            <div style={{minWidth:0}}>
              <div className="stat-val" style={{color:"var(--navy)"}}>{consultationHours}</div>
              <div className="stat-lbl">{consultationHours === 1 ? "Consultation Hour" : "Consultation Hours"}</div>
            </div>
          </div>
          {/* Total Active Patients — unique clients who have made bookings */}
          <div className="stat-card" style={{background:"#D6EEE9",borderColor:"#8FD0C6",display:"flex",alignItems:"center",gap:12}}>
            <div className="stat-icon" style={{fontSize:24,marginBottom:0,flexShrink:0}}>👥</div>
            <div style={{minWidth:0}}>
              <div className="stat-val" style={{color:"var(--navy)"}}>{activePatients}</div>
              <div className="stat-lbl">Active Patients</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="adminbar">
          {(["availability","bookings","clients","discounts","settings"] as const).map(t=>(
            <button key={t} className={"tabbtn"+(tab===t?" active":"")} onClick={()=>setTab(t)}>
              {t==="availability"?"🗓 Availability":t==="bookings"?"📋 Bookings":t==="clients"?"👥 Clients":t==="discounts"?"🎁 Discounts":"⚙️ Settings"}
            </button>
          ))}
        </div>

        {/* ══ AVAILABILITY ══ */}
        {tab==="availability" && (
          <div className="avail-layout">
            <div className="avail-top-note">
              <span>📌</span>
              <span><strong>How scheduling works:</strong> Set recurring weekly hours as a base. Then use the calendar to override specific dates — add extra hours, or block a day off.</span>
            </div>
            <div className="avail-two-col">
              {/* Calendar */}
              <div className="card" style={{flex:"0 0 auto",minWidth:0}}>
                <div className="cal-month-nav">
                  <button className="cal-nav-btn" onClick={()=>setCalMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1))}>‹</button>
                  <span className="cal-month-label">{monthLabel}</span>
                  <button className="cal-nav-btn" onClick={()=>setCalMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1))}>›</button>
                </div>
                <div className="adm-cal">
                  {DOW.map(d=><div key={d} className="adm-dow">{d}</div>)}
                  {cells.map((cell,i)=>{
                    const key=ymd(cell);
                    const isThisMonth=cell.getMonth()===calMonth.getMonth();
                    const isPast=cell<today;
                    const blocked=isBlocked(key);
                    const hasW=hasWindows(key);
                    const isSel=selDate===key;
                    let cls="adm-day";
                    if(!isThisMonth) cls+=" other-month";
                    if(isPast) cls+=" past";
                    if(blocked) cls+=" blocked";
                    else if(hasW) cls+=" has-windows";
                    if(isSel) cls+=" selected";
                    return (
                      <div key={i} className={cls} onClick={()=>!isPast&&setSelDate(key)}>
                        <span className="adm-day-num">{cell.getDate()}</span>
                        {blocked&&<span className="adm-day-dot blocked-dot"/>}
                        {!blocked&&hasW&&<span className="adm-day-dot avail-dot"/>}
                      </div>
                    );
                  })}
                </div>
                <div className="cal-legend">
                  <span><span className="leg-dot avail"/></span> Available
                  <span><span className="leg-dot blocked"/></span> Day Off
                  <span><span className="leg-dot none"/></span> No slots
                </div>
              </div>

              {/* Detail */}
              <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:14}}>
                {selDate ? (
                  <div className="card">
                    <div className="sel-date-head">
                      <h3>📅 {fmtDate(selDate)}</h3>
                      {selBlocked && <span className="exc-badge block">🚫 Day Off</span>}
                    </div>
                    {selRecurring.length>0 && (
                      <div className="win-section">
                        <div className="win-section-label">🔁 Recurring (weekly base)</div>
                        {selRecurring.map(t=>(
                          <div key={t.id} className="win-row">
                            <span className="win-time">🕐 {t.start} – {t.end}</span>
                            <button className="week-window-del" onClick={async()=>{await deleteTemplate(t.id);refresh();}}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {selExtra.length>0 && (
                      <div className="win-section">
                        <div className="win-section-label">➕ Extra hours (this date only)</div>
                        {selExtra.map(e=>(
                          <div key={e.id} className="win-row">
                            <span className="win-time">🕐 {e.start} – {e.end}</span>
                            <button className="week-window-del" onClick={async()=>{await deleteException(e.id);refresh();}}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {selRecurring.length===0&&selExtra.length===0&&!selBlocked&&(
                      <p style={{fontSize:13.5,color:"var(--muted)",margin:"4px 0 12px"}}>No availability set for this date yet.</p>
                    )}
                    {!selBlocked && (
                      <div className="date-actions">
                        <div className="win-add-form">
                          <div className="win-add-label">Add hours for this date only</div>
                          <div className="win-add-row">
                            <div><span className="lab">From</span><input type="time" value={addWin.start} onChange={e=>setAddWin(p=>({...p,start:e.target.value}))}/></div>
                            <div><span className="lab">To</span><input type="time" value={addWin.end} onChange={e=>setAddWin(p=>({...p,end:e.target.value}))}/></div>
                            <div style={{display:"flex",alignItems:"flex-end"}}>
                              <button className="btn btn-primary btn-sm" disabled={saving2} onClick={async()=>{
                                if(!selDate) return; setSaving2(true);
                                await addException({date:selDate,type:"extra",start:addWin.start,end:addWin.end});
                                await refresh(); setSaving2(false);
                              }}>{saving2?"…":"+ Add"}</button>
                            </div>
                          </div>
                        </div>
                        <div className="win-block-row">
                          <button className="btn-block-day" onClick={async()=>{if(!selDate)return;await addException({date:selDate,type:"block",start:"",end:""});refresh();}}>
                            🚫 Mark as day off
                          </button>
                        </div>
                      </div>
                    )}
                    {selBlocked && (
                      <button className="btn btn-ghost btn-sm" style={{marginTop:8}} onClick={async()=>{
                        const toRemove=(extraByDate.get(selDate!)??[]).filter(e=>e.type==="block");
                        await Promise.all(toRemove.map(e=>deleteException(e.id)));
                        refresh();
                      }}>↩ Remove day-off — restore availability</button>
                    )}
                  </div>
                ) : (
                  <div className="card" style={{textAlign:"center",padding:"32px 20px",color:"var(--muted)"}}>
                    <div style={{fontSize:36,marginBottom:10}}>📅</div>
                    <p style={{fontSize:14}}>Select a date on the calendar to manage its availability.</p>
                  </div>
                )}

                {/* Recurring weekly base */}
                <div className="card">
                  <h3 style={{marginBottom:4}}>🔁 Recurring Weekly Hours</h3>
                  <p className="card-sub" style={{marginBottom:14}}>Your default hours each weekday. Overridden by date-specific settings above.</p>
                  <div className="week-grid">
                    {[1,2,3,4,5,6,0].map(dayIdx=>{
                      const dayTpls=templates.filter(t=>Number(t.weekday)===dayIdx&&t.active);
                      return (
                        <div key={dayIdx} className={"week-day-card"+(dayTpls.length>0?" active":"")}>
                          <div className="week-day-head">
                            <span className="week-day-name">{DOW[dayIdx]}</span>
                            {dayTpls.length>0?<span className="week-day-badge">{dayTpls.length}×</span>:<span className="week-day-off">Off</span>}
                          </div>
                          <div className="week-windows">
                            {dayTpls.map(t=>(
                              <div key={t.id} className="week-window">
                                <span className="week-window-time">{t.start}–{t.end}</span>
                                <button className="week-window-del" onClick={async()=>{await deleteTemplate(t.id);refresh();}}>✕</button>
                              </div>
                            ))}
                          </div>
                          {addingDay === dayIdx ? (
                            <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:6}}>
                              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                                <input
                                  type="time"
                                  value={newWinStart}
                                  onChange={e=>setNewWinStart(e.target.value)}
                                  style={{fontSize:12,padding:"4px 6px",borderRadius:6,border:"1px solid var(--line)",width:"auto"}}
                                />
                                <span style={{fontSize:11,color:"var(--muted)"}}>to</span>
                                <input
                                  type="time"
                                  value={newWinEnd}
                                  onChange={e=>setNewWinEnd(e.target.value)}
                                  style={{fontSize:12,padding:"4px 6px",borderRadius:6,border:"1px solid var(--line)",width:"auto"}}
                                />
                              </div>
                              <div style={{display:"flex",gap:6}}>
                                <button
                                  className="btn btn-primary btn-sm"
                                  style={{fontSize:11,padding:"4px 10px"}}
                                  onClick={async()=>{
                                    await saveTemplate({weekday:dayIdx,start:newWinStart,end:newWinEnd,active:true});
                                    await refresh();
                                    setAddingDay(null);
                                  }}
                                >Save</button>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{fontSize:11,padding:"4px 10px"}}
                                  onClick={()=>setAddingDay(null)}
                                >Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <button
                              className="week-add-btn"
                              onClick={()=>{
                                setNewWinStart("09:00");
                                setNewWinEnd("17:00");
                                setAddingDay(dayIdx);
                              }}
                            >+ Add</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ BOOKINGS ══ */}
        {tab==="bookings" && (
          <>

              {/* ── Filter buttons ── */}
              <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
                {(["upcoming","past","archived"] as const).map(f => (
                  <button
                    key={f}
                    className={"filter-pill" + (bookingsFilter === f ? " active" : "")}
                    onClick={() => setBookingsFilter(f)}
                  >
                    {f === "upcoming" ? "📅 Upcoming" : f === "past" ? "📜 Past Sessions" : "🗄 Archived"}
                  </button>
                ))}
              </div>

              {/* ── Upcoming: calendar + day bookings ── */}
              {bookingsFilter === "upcoming" && (
                <>
                  {/* Horizontal scrollable calendar strip */}
                  <div style={{
                    display:"flex", alignItems:"center", gap:6, marginBottom:16,
                    overflow:"hidden",
                  }}>
                    <button
                      className="cal-nav-btn"
                      onClick={() => {
                        const d = new Date(calScrollStart + "T00:00:00");
                        d.setDate(d.getDate() - 7);
                        setCalScrollStart(ymd(d));
                      }}
                      style={{ flexShrink:0 }}
                      aria-label="Previous week"
                    >‹</button>
                    <div
                      ref={calStripRef}
                      style={{
                        display:"flex", gap:4, overflowX:"auto", scrollSnapType:"x mandatory",
                        flex:1, paddingBottom:4, scrollbarWidth:"thin",
                        WebkitOverflowScrolling:"touch",
                      }}
                    >
                      {calDays.map(d => {
                        const ds = ymd(d);
                        const isToday = ds === ymd(new Date());
                        const isSel = ds === calSelectedDate;
                        const dayBookings = nonArchived.filter(b =>
                          b.status === "paid" && ymd(b.slotStart.toDate()) === ds
                        );
                        const hasBookings = dayBookings.length > 0;
                        const hasCompleted = dayBookings.some(b => (sessionStatuses[b.id] ?? "none") === "complete");
                        return (
                          <button
                            key={ds}
                            onClick={() => setCalSelectedDate(ds)}
                            style={{
                              flexShrink:0, width:32, paddingTop:5, paddingBottom:5,
                              borderRadius:8, border:"2px solid", cursor:"pointer",
                              display:"flex", flexDirection:"column", alignItems:"center", gap:1,
                              scrollSnapAlign:"start",
                              borderColor: isSel ? "var(--teal)" : isToday ? "rgba(14,138,122,.3)" : "#e8edf3",
                              background: isSel ? "linear-gradient(135deg,#0E8A7A,#0B2B4A)" : isToday ? "#f0fdfa" : "#fff",
                              color: isSel ? "#fff" : "var(--navy)",
                              transition:"all .2s",
                            }}
                          >
                            <span style={{fontSize:7,fontWeight:600,textTransform:"uppercase",opacity:.7}}>
                              {DOW_SHORT[d.getDay()]}
                            </span>
                            <span style={{fontSize:15,fontWeight:800}}>
                              {d.getDate()}
                            </span>
                            <span style={{fontSize:7,opacity:.8}}>
                              {MON_SHORT[d.getMonth()]}
                            </span>
                            <span style={{display:"flex",gap:3,marginTop:2,height:6}}>
                              {hasBookings && (
                                <span style={{
                                  width:6, height:6, borderRadius:"50%",
                                  background: isSel ? "#fff" : hasCompleted ? "#0E8A7A" : "#0B2B4A",
                                }} />
                              )}
                              {hasBookings && dayBookings.length > 1 && (
                                <span style={{
                                  fontSize:8, fontWeight:700, lineHeight:"6px",
                                  color: isSel ? "rgba(255,255,255,.8)" : "var(--muted)",
                                }}>
                                  {dayBookings.length}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      className="cal-nav-btn"
                      onClick={() => {
                        const d = new Date(calScrollStart + "T00:00:00");
                        d.setDate(d.getDate() + 7);
                        setCalScrollStart(ymd(d));
                      }}
                      style={{ flexShrink:0 }}
                      aria-label="Next week"
                    >›</button>
                  </div>

                  {(() => {
                    const dayBookings = nonArchived
                      .filter(b => b.status === "paid" && ymd(b.slotStart.toDate()) === calSelectedDate)
                      .sort((a, b) => a.slotStart.toMillis() - b.slotStart.toMillis());

                    const selDateLabel = new Date(calSelectedDate + "T00:00:00").toLocaleDateString("en-NG", {
                      weekday: "long", day: "numeric", month: "long", year: "numeric"
                    });

                    if (dayBookings.length === 0) {
                      return (
                        <div className="empty-state">
                          <div style={{fontSize:36,marginBottom:8}}>📅</div>
                          <p style={{color:"var(--muted)"}}>No sessions on {selDateLabel}</p>
                        </div>
                      );
                    }
                    return (
                      <>
                        <div style={{
                          fontSize:13, fontWeight:700, color:"var(--navy)", marginBottom:12,
                          padding:"8px 14px", background:"#f8fafc", borderRadius:8,
                          display:"flex", alignItems:"center", justifyContent:"space-between",
                        }}>
                          <span>{selDateLabel}</span>
                          <span style={{fontSize:12,color:"var(--muted)"}}>
                            {dayBookings.length} session{dayBookings.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="booking-compact-list">
                          {dayBookings.map(b => (
                            <BookingCard key={b.id} b={b} onArchive={handleArchive} filterMode="upcoming" sessionStatus={sessionStatuses[b.id]} />
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </>
              )}

              {/* ── Past Sessions ── */}
              {bookingsFilter === "past" && (
                (() => {
                  const pastBookings = nonArchived
                    .filter(b => b.status === "paid" &&
                      (b.slotStart.toDate() < new Date() || (sessionStatuses[b.id] ?? "none") === "complete"))
                    .sort((a, b) => b.slotStart.toMillis() - a.slotStart.toMillis());

                  if (pastBookings.length === 0) {
                    return (
                      <div className="empty-state">
                        <div style={{fontSize:36,marginBottom:8}}>📜</div>
                        <p style={{color:"var(--muted)"}}>No past sessions yet.</p>
                      </div>
                    );
                  }
                  return (
                    <div className="booking-compact-list">
                      {pastBookings.map(b => (
                        <BookingCard key={b.id} b={b} onArchive={handleArchive} filterMode="past" sessionStatus={sessionStatuses[b.id]} />
                      ))}
                    </div>
                  );
                })()
              )}

              {/* ── Archived Sessions ── */}
              {bookingsFilter === "archived" && (
                (() => {
                  const archivedBookings = bookings
                    .filter(b => b.archived)
                    .sort((a, b) => b.slotStart.toMillis() - a.slotStart.toMillis());

                  if (archivedBookings.length === 0) {
                    return (
                      <div className="empty-state">
                        <div style={{fontSize:36,marginBottom:8}}>🗄</div>
                        <p style={{color:"var(--muted)"}}>No archived sessions. Archive a session to tidy up your active list.</p>
                      </div>
                    );
                  }
                  return (
                    <div className="booking-compact-list">
                      {archivedBookings.map(b => (
                        <BookingCard key={b.id} b={b}
                          onArchive={handleArchive}
                          onPermanentDelete={handlePermanentDelete}
                          onUnarchive={handleUnarchive}
                          filterMode="archived"
                          sessionStatus={sessionStatuses[b.id]}
                        />
                      ))}
                    </div>
                  );
                })()
              )}
          </>
        )}

        {/* ══ CLIENTS ══ */}
        {tab==="clients" && (
          <div className="card">
            <div className="card-header" style={{marginBottom:16}}>
              <div>
                <h3>👥 Clients</h3>
                <p className="card-sub">Click a client to view their info and add consultation notes</p>
              </div>
            </div>
            {(() => {
              const clientMap = new Map<string, { id: string; name: string; email: string; bookingCount: number; lastVisit?: Date }>();
              bookings.forEach(b => {
                if (!b.clientId) return;
                const existing = clientMap.get(b.clientId);
                if (existing) {
                  existing.bookingCount++;
                  const d = b.slotStart.toDate();
                  if (!existing.lastVisit || d > existing.lastVisit) existing.lastVisit = d;
                } else {
                  clientMap.set(b.clientId, {
                    id: b.clientId,
                    name: b.clientName || "Unknown",
                    email: b.clientEmail || "",
                    bookingCount: 1,
                    lastVisit: b.slotStart.toDate(),
                  });
                }
              });
              const clientList = Array.from(clientMap.values()).sort((a,b) =>
                (b.lastVisit?.getTime() ?? 0) - (a.lastVisit?.getTime() ?? 0)
              );

              if (clientList.length === 0) {
                return <p style={{color:"var(--muted)",fontSize:14,textAlign:"center",padding:"24px 0"}}>No clients yet.</p>;
              }

              return (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {clientList.map(c => (
                    <Link
                      key={c.id}
                      href={`/clients/${c.id}`}
                      style={{
                        display:"flex",alignItems:"center",gap:14,
                        padding:"14px 16px", borderRadius:12,
                        border:"1px solid var(--line)", background:"#fff",
                        textDecoration:"none", cursor:"pointer",
                        transition:"all .15s",
                      }}
                      onMouseOver={e => { e.currentTarget.style.borderColor="var(--teal)"; e.currentTarget.style.background="#f0fdfa"; }}
                      onMouseOut={e => { e.currentTarget.style.borderColor="var(--line)"; e.currentTarget.style.background="#fff"; }}
                    >
                      <div style={{
                        width:42, height:42, borderRadius:"50%", flexShrink:0,
                        background:"linear-gradient(135deg,var(--teal),var(--sky))",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:17, fontWeight:700, color:"#fff",
                      }}>{c.name?.[0]?.toUpperCase() ?? "?"}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:14,color:"var(--navy)"}}>{c.name}</div>
                        <div style={{fontSize:12,color:"var(--muted)"}}>
                          {c.bookingCount} session{c.bookingCount!==1?"s":""}
                          {c.lastVisit && ` \u00b7 Last: ${MON[c.lastVisit.getMonth()]} ${c.lastVisit.getDate()}`}
                        </div>
                      </div>
                      <span style={{fontSize:16,color:"var(--muted)"}}>\u2192</span>
                    </Link>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* ══ SETTINGS ══ */}
        {tab==="discounts" && (
          <div className="card">
            <div className="card-header" style={{marginBottom:16}}>
              <div>
                <h3>🎁 Issued Discounts</h3>
                <p className="card-sub">{discountCodes.length} discount{discountCodes.length!==1?"s":""} issued</p>
              </div>
            </div>
            {discountCodes.length === 0 ? (
              <div className="empty-state" style={{padding:"24px 0",textAlign:"center"}}>
                <div style={{fontSize:28,marginBottom:6}}>🎫</div>
                <p style={{color:"var(--muted)",fontSize:13}}>No discounts issued yet. Send one from inside a session.</p>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {discountCodes.slice().sort((a,b)=>b.createdAt.toMillis()-a.createdAt.toMillis()).map(dc => {
                  const exp = dc.expiresAt.toDate().toLocaleDateString("en-NG",{day:"numeric",month:"short"});
                  const now_ = Date.now();
                  const isActive = !dc.used && dc.expiresAt.toMillis() >= now_;
                  const isExpired = !dc.used && dc.expiresAt.toMillis() < now_;
                  return (
                    <div key={dc.id} style={{
                      display:"flex",alignItems:"center",gap:10,padding:"9px 12px",
                      borderRadius:10,background:"#f8fafc",border:"1px solid #e8edf3",
                    }}>
                      {/* Percent badge */}
                      <div style={{
                        width:42,height:42,borderRadius:8,display:"flex",flexDirection:"column",
                        alignItems:"center",justifyContent:"center",flexShrink:0,
                        background: dc.used ? "#f0f0f0" : isExpired ? "#fef9ec" : "linear-gradient(135deg,#0B2B4A,#0E8A7A)",
                        color: dc.used ? "#aaa" : isExpired ? "#b45309" : "#fff",
                      }}>
                        <span style={{fontWeight:800,fontSize:14,lineHeight:1}}>{dc.percent}%</span>
                        <span style={{fontSize:9,fontWeight:600,opacity:.75}}>OFF</span>
                      </div>
                      {/* Code + meta */}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <span style={{fontWeight:700,fontSize:13,color:"var(--navy)",letterSpacing:".05em",fontFamily:"monospace"}}>{dc.code}</span>
                          {dc.used && <span style={{fontSize:10,fontWeight:700,background:"#f0f0f0",color:"#888",borderRadius:999,padding:"1px 7px"}}>USED</span>}
                          {isExpired && <span style={{fontSize:10,fontWeight:700,background:"#fef9ec",color:"#b45309",borderRadius:999,padding:"1px 7px"}}>EXPIRED</span>}
                          {isActive && <span style={{fontSize:10,fontWeight:700,background:"rgba(14,138,122,.1)",color:"#0E8A7A",borderRadius:999,padding:"1px 7px"}}>ACTIVE</span>}
                        </div>
                        <div style={{fontSize:11,color:"var(--muted)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {dc.createdForName} · exp {exp}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab==="settings" && (
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            {/* ── Analytics Chart ── */}
            <div className="card">
              <div className="card-header" style={{marginBottom:16}}>
                <div>
                  <h3>📊 Analytics</h3>
                  <p className="card-sub">Total: {ngn(totalEarnings)} across all completed sessions</p>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                  <button className={"filter-pill"+(earningsFilter==="week"?" active":"")} onClick={()=>{setEarningsFilter("week");setEarningsFrom("");setEarningsTo("");}}>This week</button>
                  <button className={"filter-pill"+(earningsFilter==="month"?" active":"")} onClick={()=>{setEarningsFilter("month");setEarningsFrom("");setEarningsTo("");}}>By month</button>
                </div>
              </div>
              {/* Date range picker */}
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
                <label style={{fontSize:12,color:"var(--muted)",fontWeight:600}}>Custom range:</label>
                <input type="date" value={earningsFrom} onChange={e=>setEarningsFrom(e.target.value)} style={{fontSize:12,padding:"4px 8px",borderRadius:6,border:"1px solid var(--line)"}} />
                <span style={{fontSize:12,color:"var(--muted)"}}>to</span>
                <input type="date" value={earningsTo} onChange={e=>setEarningsTo(e.target.value)} style={{fontSize:12,padding:"4px 8px",borderRadius:6,border:"1px solid var(--line)"}} />
                {(earningsFrom||earningsTo)&&<button className="btn btn-ghost btn-sm" onClick={()=>{setEarningsFrom("");setEarningsTo("");}}>Clear</button>}
              </div>
              {/* Bar chart */}
              <div style={{display:"flex",alignItems:"flex-end",gap:6,height:140,padding:"0 4px"}}>
                {earningsChartData.labels.map((lbl,i)=>{
                  const val = earningsChartData.values[i]??0;
                  const pct = earningsChartData.max > 0 ? (val/earningsChartData.max)*100 : 0;
                  return (
                    <div key={lbl+i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,minWidth:0}}>
                      <div style={{fontSize:9,color:"var(--muted)",fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%",textAlign:"center"}}>
                        {val>0?ngn(val):""}
                      </div>
                      <div style={{width:"100%",display:"flex",alignItems:"flex-end",height:90}}>
                        <div style={{
                          width:"100%",
                          height:`${Math.max(pct,val>0?4:1)}%`,
                          background:val>0?"linear-gradient(180deg,var(--teal),var(--sky))":"var(--line)",
                          borderRadius:"4px 4px 0 0",
                          transition:"height .3s",
                          minHeight:val>0?4:1,
                        }} title={ngn(val)} />
                      </div>
                      <div style={{fontSize:9,color:"var(--muted)",fontWeight:600,whiteSpace:"nowrap"}}>{lbl}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Practice Settings ── */}
            <div className="card">
              <div className="card-header" style={{marginBottom:20}}>
                <div>
                  <h3>⚙️ Practice Settings</h3>
                  <p className="card-sub">Configure pricing, session length, and booking window.</p>
                </div>
              </div>
              <div className="settings-grid">
                {[
                  {key:"practitionerName",label:"Practitioner Name",type:"text",hint:"Displayed to clients"},
                  {key:"priceNGN",label:"Session Price (₦)",type:"number",hint:"Amount per session"},
                  {key:"sessionLengthMin",label:"Session Length (min)",type:"number",hint:"Duration of each consultation"},
                  {key:"bufferMin",label:"Buffer Between Sessions (min)",type:"number",hint:"Gap between back-to-back bookings"},
                  {key:"bookingWindowDays",label:"Booking Window (days)",type:"number",hint:"How far ahead clients can book"},
                  {key:"rescheduleFeeNGN",label:"Reschedule Fee (₦)",type:"number",hint:"One-time fee clients pay to reschedule"},
                ].map(({key,label,type,hint})=>(
                  <div key={key} className="settings-field">
                    <label>{label}</label>
                    <input type={type} value={(settings as unknown as Record<string,unknown>)[key] as string|number}
                      onChange={e=>setSettings({...settings,[key]:type==="number"?+e.target.value:e.target.value})}/>
                    <span className="field-hint">{hint}</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" style={{marginTop:14}} disabled={saving}
                onClick={async()=>{setSaving(true);await saveSettings(settings);setSaving(false);}}>
                {saving?"Saving…":"💾 Save Settings"}
              </button>
            </div>

            {/* ── Data Management (Testing Mode) ── */}
            <div className="card" style={{borderColor:"#fbbf24",borderWidth:2}}>
              <div className="card-header" style={{marginBottom:16}}>
                <div>
                  <h3 style={{color:"#f59e0b"}}>⚠️ Data Management (Testing)</h3>
                  <p className="card-sub">Backup or clear all test data before going live.</p>
                </div>
              </div>

              {clearStep === "idle" && !showClearConfirm && (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.6}}>
                    Use this to start fresh before launching. <strong>Backup</strong> downloads all data as JSON.
                    <strong> Clear Database</strong> deletes all bookings, sessions, messages, notes, and discount codes permanently.
                  </p>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                    <button
                      className="btn btn-ghost"
                      style={{borderColor:"var(--teal)",color:"var(--teal)"}}
                      disabled={clearing}
                      onClick={async () => {
                        setClearing(true);
                        setClearProgress("Backing up data…");
                        try {
                          const { db } = await import("@/lib/firebase");
                          const { collection, getDocs } = await import("firebase/firestore");

                          const backup: Record<string, unknown> = { timestamp: new Date().toISOString() };

                          try {
                            const snap = await getDocs(collection(db, "bookings"));
                            backup.bookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                          } catch (e) { backup.bookings = `Error: ${e}`; }

                          try {
                            const snap = await getDocs(collection(db, "discountCodes"));
                            backup.discountCodes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                          } catch (e) { backup.discountCodes = `Error: ${e}`; }

                          try {
                            const snap = await getDocs(collection(db, "settings"));
                            backup.settings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                          } catch (e) { backup.settings = `Error: ${e}`; }

                          const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `consultdrfat-backup-${new Date().toISOString().split("T")[0]}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                          setClearProgress("Backup downloaded!");
                        } catch (err) {
                          console.error("Backup error:", err);
                          alert("Backup failed. Check console for details.");
                        } finally {
                          setClearing(false);
                          setTimeout(() => setClearProgress(""), 3000);
                        }
                      }}
                    >
                      📦 Backup Data (JSON)
                    </button>
                    <button
                      className="btn"
                      style={{background:"#ef4444",color:"#fff",borderColor:"#ef4444"}}
                      onClick={() => setShowClearConfirm(true)}
                    >
                      🗑️ Clear All Data
                    </button>
                  </div>
                  {clearProgress && (
                    <p style={{fontSize:12,color:"var(--teal)",fontWeight:600}}>{clearProgress}</p>
                  )}
                </div>
              )}

              {showClearConfirm && (
                <div style={{
                  background:"#fef2f2",borderRadius:12,padding:20,
                  border:"2px solid #ef4444",
                }}>
                  <h4 style={{color:"#dc2626",margin:"0 0 12px"}}>⚠️ Are you absolutely sure?</h4>
                  <p style={{fontSize:13,color:"#7f1d1d",lineHeight:1.6,marginBottom:16}}>
                    This will permanently delete ALL bookings, sessions, chat messages, client notes, and discount codes.
                    This cannot be undone. Make sure you've downloaded a backup first.
                  </p>
                  <div style={{display:"flex",gap:10}}>
                    <button
                      className="btn"
                      style={{background:"#dc2626",color:"#fff",borderColor:"#dc2626"}}
                      disabled={clearing}
                      onClick={async () => {
                        setClearing(true);
                        setClearProgress("Deleting bookings…");
                        try {
                          const { db } = await import("@/lib/firebase");
                          const { collection, getDocs, deleteDoc } = await import("firebase/firestore");

                          // Delete all bookings + subcollections
                          const bookingsSnap = await getDocs(collection(db, "bookings"));
                          for (const d of bookingsSnap.docs) {
                            try {
                              const msgsSnap = await getDocs(collection(db, "bookings", d.id, "messages"));
                              for (const m of msgsSnap.docs) await deleteDoc(m.ref);
                            } catch {}
                            try {
                              const sessSnap = await getDocs(collection(db, "bookings", d.id, "session"));
                              for (const s of sessSnap.docs) await deleteDoc(s.ref);
                            } catch {}
                            await deleteDoc(d.ref);
                          }
                          setClearProgress("Deleting discount codes…");

                          const dcSnap = await getDocs(collection(db, "discountCodes"));
                          for (const d of dcSnap.docs) await deleteDoc(d.ref);

                          setClearProgress("Deleting client notes…");
                          const clientsSnap = await getDocs(collection(db, "clients"));
                          for (const c of clientsSnap.docs) {
                            try {
                              const notesSnap = await getDocs(collection(db, "clients", c.id, "notes"));
                              for (const n of notesSnap.docs) await deleteDoc(n.ref);
                            } catch {}
                            await deleteDoc(c.ref);
                          }

                          setClearProgress("Deleting calls…");
                          const callsSnap = await getDocs(collection(db, "calls"));
                          for (const d of callsSnap.docs) {
                            try {
                              const ocSnap = await getDocs(collection(db, "calls", d.id, "offerCandidates"));
                              for (const c of ocSnap.docs) await deleteDoc(c.ref);
                            } catch {}
                            try {
                              const acSnap = await getDocs(collection(db, "calls", d.id, "answerCandidates"));
                              for (const c of acSnap.docs) await deleteDoc(c.ref);
                            } catch {}
                            await deleteDoc(d.ref);
                          }

                          setClearProgress("✅ All data cleared! Refreshing…");
                          setTimeout(() => window.location.reload(), 2000);
                        } catch (err) {
                          console.error("Clear data error:", err);
                          setClearProgress("❌ Error clearing data. Check console.");
                          setClearing(false);
                        }
                      }}
                    >
                      {clearing ? "Deleting…" : "Yes, delete everything"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => { setShowClearConfirm(false); }}
                    >
                      Cancel
                    </button>
                  </div>
                  {clearProgress && (
                    <p style={{fontSize:12,color:"#7f1d1d",fontWeight:600,marginTop:10}}>{clearProgress}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        <div style={{height:48}}/>
      </div>
    </div>
  );
}