"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  getSettings, saveSettings, getTemplates, saveTemplate, deleteTemplate,
  getExceptions, addException, deleteException, watchBookings, ensurePractitionerConfig,
  archiveBooking, watchWaitingRoom, getSessionStatus,
} from "@/lib/db";
import {
  PracticeSettings, DEFAULT_SETTINGS, AvailabilityTemplate, AvailabilityException, Booking,
} from "@/lib/types";
import SignInForm from "@/components/SignInForm";

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ngn = (n: number) => new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(n);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
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

const BrandNav = ({ onSignOut }: { onSignOut: () => void }) => (
  <nav className="nav" style={{borderBottom:"1px solid var(--line)",marginBottom:4}}>
    <div className="brand">
      <div className="brand-icon">🩺</div>
      <div className="brand-text"><span>ConsultDrFat</span><small>Practitioner Portal</small></div>
    </div>
    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
      <Link href="/" className="btn btn-ghost btn-sm">← Site</Link>
      <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign Out</button>
    </div>
  </nav>
);

// ── Compact booking card with accordion expand ──────────────────────────────
function BookingCard({ b, onArchive }: { b: Booking; onArchive: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
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
          <span className={"status-pill " + b.status}>
            {b.status === "paid" ? "✅ Confirmed" : b.status === "held" ? "⏳ Pending" : "❌ Cancelled"}
          </span>
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
            {b.status === "paid" && (
              <Link className="btn btn-sm btn-primary" href={`/session/?id=${b.id}&role=practitioner`}>
                🎙 Join Session
              </Link>
            )}
            {isPast && (
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
  const [tab, setTab]               = useState<"availability"|"bookings"|"settings">("availability");
  const [settings, setSettings]     = useState<PracticeSettings>(DEFAULT_SETTINGS);
  const [templates, setTemplates]   = useState<AvailabilityTemplate[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [bookings, setBookings]     = useState<Booking[]>([]);
  const [saving, setSaving]         = useState(false);
  const [bookFilter, setBookFilter] = useState<"upcoming"|"past"|"pending">("upcoming");

  // Waiting room
  const [waitingRoom, setWaitingRoom] = useState<Booking[]>([]);
  const [waitingSessions, setWaitingSessions] = useState<Record<string, string>>({});
  const [waitingRoomOpen, setWaitingRoomOpen] = useState(false);

  // Availability calendar
  const today = useMemo(() => { const d=new Date(); d.setHours(0,0,0,0); return d; }, []);
  const [calMonth, setCalMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selDate, setSelDate]   = useState<string|null>(null);
  const [addWin, setAddWin]     = useState({ start:"09:00", end:"17:00" });
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

  useEffect(() => { if (role === "practitioner") return watchBookings(setBookings); }, [role]);

  // Waiting room live subscription
  useEffect(() => {
    if (role !== "practitioner") return;
    const unsub = watchWaitingRoom(async (rows) => {
      setWaitingRoom(rows);
      // Check session status for each waiting booking
      const statuses: Record<string, string> = {};
      await Promise.all(rows.map(async (b) => {
        statuses[b.id] = await getSessionStatus(b.id);
      }));
      setWaitingSessions(statuses);
    });
    return unsub;
  }, [role]);

  const handleArchive = async (id: string) => {
    await archiveBooking(id);
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

  if (loading) return <div className="center" style={{minHeight:"100vh"}}><div style={{fontSize:40}}>🩺</div><p style={{color:"var(--muted)"}}>Loading…</p></div>;
  if (!user) return <SignInForm />;
  if (role !== "practitioner") return (
    <div className="center" style={{minHeight:"100vh"}}>
      <div style={{fontSize:52}}>🚫</div>
      <h2>Access Restricted</h2>
      <p>This area is for the practitioner only.</p>
      <Link className="btn btn-primary" href="/book/">📅 Book a Consultation Instead</Link>
    </div>
  );

  const now = new Date();
  const nonArchived = bookings.filter(b => !(b as Booking & { archived?: boolean }).archived);
  const stats = {
    confirmed: nonArchived.filter(b=>b.status==="paid").length,
    pending:   nonArchived.filter(b=>b.status==="held").length,
    earnings:  nonArchived.filter(b=>b.status==="paid").reduce((a,b)=>a+b.amountNGN,0),
  };

  const filteredBookings = nonArchived
    .filter(b => {
      const bDate = b.slotStart.toDate();
      if (bookFilter === "upcoming") return b.status === "paid" && bDate >= now;
      if (bookFilter === "past")     return bDate < now;
      if (bookFilter === "pending")  return b.status === "held";
      return true;
    })
    .sort((a,b) => {
      if (bookFilter === "past") return b.slotStart.toMillis() - a.slotStart.toMillis(); // newest first for past
      return a.slotStart.toMillis() - b.slotStart.toMillis();
    });

  const cells = calCells(calMonth);
  const monthLabel = `${MON[calMonth.getMonth()]} ${calMonth.getFullYear()}`;
  const selRecurring = selDate ? recurringWindows(selDate) : [];
  const selExtra     = selDate ? extraWindows(selDate) : [];
  const selBlocked   = selDate ? isBlocked(selDate) : false;

  return (
    <div style={{minHeight:"100vh",background:"var(--paper)"}}>
      <div className="wrap">
        <BrandNav onSignOut={signOut} />



        {/* Stats — 3 cards: Confirmed, Earnings, Waiting Room */}
        <div className="dash-stats-grid">
          {[
            {val:stats.confirmed,     label:"Confirmed",    color:"var(--teal)",  icon:"✅"},
            {val:ngn(stats.earnings), label:"Earnings",     color:"var(--navy)",  icon:"💰"},
            {val:waitingRoom.length,  label:"Waiting Room", color:"var(--sky)",   icon:"🚪"},
          ].map(s=>(
            <div key={s.label} className="stat-card">
              <div className="stat-icon">{s.icon}</div>
              <div className="stat-val" style={{color:s.color}}>{s.val}</div>
              <div className="stat-lbl">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="adminbar">
          {(["availability","bookings","settings"] as const).map(t=>(
            <button key={t} className={"tabbtn"+(tab===t?" active":"")} onClick={()=>setTab(t)}>
              {t==="availability"?"🗓 Availability":t==="bookings"?"📋 Bookings":"⚙️ Settings"}
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
                          <button className="week-add-btn" onClick={async()=>{await saveTemplate({weekday:dayIdx,start:"09:00",end:"17:00",active:true});refresh();}}>+ Add</button>
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
            {/* ── Waiting Room Widget ── */}
            <div className={"wr-widget" + (waitingRoomOpen ? " open" : "")}>
              <button
                className="wr-widget-toggle"
                onClick={() => setWaitingRoomOpen(v => !v)}
              >
                <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
                  {waitingRoom.length > 0 && <div className="wr-pulse-dot" />}
                  <span style={{fontWeight:700,fontSize:14}}>🚪 Waiting Room</span>
                  {waitingRoom.length > 0 ? (
                    <span className="wr-count">{waitingRoom.length} patient{waitingRoom.length!==1?"s":""}</span>
                  ) : (
                    <span style={{fontSize:12,color:"var(--muted)"}}>Empty</span>
                  )}
                </div>
                <span style={{fontSize:13,color:"var(--muted-2)",transform:waitingRoomOpen?"rotate(180deg)":"none",transition:"transform .2s"}}>▾</span>
              </button>
              {waitingRoomOpen && (
                <div className="wr-widget-body">
                  {waitingRoom.length === 0 ? (
                    <p style={{color:"var(--muted)",fontSize:13,textAlign:"center",padding:"12px 0"}}>No clients waiting right now.</p>
                  ) : (
                    <div className="wr-list">
                      {waitingRoom.map(b => {
                        const d = b.slotStart.toDate();
                        const sessStatus = waitingSessions[b.id] ?? "none";
                        const isLiveAlready = sessStatus === "live";
                        return (
                          <div key={b.id} className="wr-card">
                            <div className="wr-avatar">{b.clientName?.[0] ?? "?"}</div>
                            <div className="wr-info">
                              <div className="wr-name">{b.clientName}</div>
                              <div className="wr-slot">📅 {fmtDT(d)}</div>
                              {b.topic && <div className="wr-topic">💬 {b.topic}</div>}
                            </div>
                            <div className="wr-actions">
                              {isLiveAlready && <span className="wr-live-badge">● Live</span>}
                              <Link href={`/session/?id=${b.id}&role=practitioner`} className="btn btn-sm btn-primary">
                                {isLiveAlready ? "Rejoin" : "Start Session →"}
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="card" style={{marginTop:0}}>
              <div className="card-header" style={{marginBottom:16}}>
                <div>
                  <h3>📋 Bookings</h3>
                  <p className="card-sub">{stats.confirmed} confirmed · click a row to expand</p>
                </div>
                <div className="filter-pills">
                  {([
                    {key:"upcoming", label:"📅 Upcoming"},
                    {key:"past",     label:"🕐 Past"},
                  ] as const).map(f=>(
                    <button key={f.key} className={"filter-pill"+(bookFilter===f.key?" active":"")} onClick={()=>setBookFilter(f.key)}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredBookings.length === 0 ? (
                <div className="empty-state">
                  <div style={{fontSize:36,marginBottom:8}}>📭</div>
                  <p style={{color:"var(--muted)"}}>No bookings in this category.</p>
                </div>
              ) : (
                <div className="booking-compact-list">
                  {filteredBookings.map(b => (
                    <BookingCard key={b.id} b={b} onArchive={handleArchive} />
                  ))}
                </div>
              )}

              {bookFilter === "past" && (
                <p style={{fontSize:12,color:"var(--muted)",marginTop:12,textAlign:"center"}}>
                  Tip: use the 🗄 Archive button on past bookings to keep your list tidy.
                </p>
              )}
            </div>
          </>
        )}

        {/* ══ SETTINGS ══ */}
        {tab==="settings" && (
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
        )}
        <div style={{height:48}}/>
      </div>
    </div>
  );
}
