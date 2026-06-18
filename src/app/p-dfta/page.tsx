"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  getSettings, saveSettings, getTemplates, saveTemplate, deleteTemplate,
  getExceptions, addException, deleteException, watchBookings, ensurePractitionerConfig,
} from "@/lib/db";
import {
  PracticeSettings, DEFAULT_SETTINGS, AvailabilityTemplate, AvailabilityException, Booking,
} from "@/lib/types";
import SignInForm from "@/components/SignInForm";

const DOW_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DOW_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ngn = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);

// Weekday grid — each day can have multiple time windows
const DAYS = [1,2,3,4,5,6,0]; // Mon–Sun display order

const BrandNav = ({ onSignOut }: { onSignOut: () => void }) => (
  <nav className="nav" style={{ borderBottom: "1px solid var(--line)", marginBottom: 4 }}>
    <div className="brand">
      <div className="brand-icon">🩺</div>
      <div className="brand-text">
        <span>ConsultDrFat</span>
        <small>Practitioner Portal</small>
      </div>
    </div>
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <Link href="/" className="btn btn-ghost btn-sm">← Site</Link>
      <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign Out</button>
    </div>
  </nav>
);

// ── Main Admin Page ────────────────────────────────────────────────────────
export default function AdminPage() {
  const { user, role, loading, signOut } = useAuth();
  const [tab, setTab]             = useState<"availability" | "bookings" | "settings">("availability");
  const [settings, setSettings]   = useState<PracticeSettings>(DEFAULT_SETTINGS);
  const [templates, setTemplates] = useState<AvailabilityTemplate[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [bookings, setBookings]   = useState<Booking[]>([]);
  const [saving, setSaving]       = useState(false);
  const [addingFor, setAddingFor] = useState<number | null>(null); // weekday being edited
  const [newWindow, setNewWindow] = useState({ start: "09:00", end: "17:00" });
  const [exc, setExc]             = useState({ date: "", type: "block" as "block" | "extra", start: "", end: "" });
  const [savingTpl, setSavingTpl] = useState(false);
  const [bookFilter, setBookFilter] = useState<"all" | "paid" | "held">("all");

  const refresh = async () => {
    setSettings(await getSettings());
    setTemplates(await getTemplates());
    setExceptions(await getExceptions());
  };

  useEffect(() => {
    if (role === "practitioner" && user) {
      ensurePractitionerConfig(user.uid).catch(console.warn);
      refresh();
    }
  }, [role, user]);

  useEffect(() => { if (role === "practitioner") return watchBookings(setBookings); }, [role]);

  if (loading) return (
    <div className="center" style={{ minHeight: "100vh" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🩺</div>
      <p style={{ color: "var(--muted)" }}>Loading…</p>
    </div>
  );

  if (!user) return <SignInForm />;

  if (role !== "practitioner") return (
    <div className="center" style={{ minHeight: "100vh" }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>🚫</div>
      <h2>Access Restricted</h2>
      <p>This area is for the practitioner only.</p>
      <Link className="btn btn-primary" href="/book/">📅 Book a Consultation Instead</Link>
    </div>
  );

  // Group templates by weekday
  const byDay = new Map<number, AvailabilityTemplate[]>();
  for (const t of templates) {
    if (!byDay.has(t.weekday)) byDay.set(t.weekday, []);
    byDay.get(t.weekday)!.push(t);
  }

  const filteredBookings = bookings.filter(b =>
    bookFilter === "all" ? true : b.status === bookFilter
  ).sort((a,b) => a.slotStart.toMillis() - b.slotStart.toMillis());

  const stats = {
    confirmed: bookings.filter(b => b.status === "paid").length,
    pending:   bookings.filter(b => b.status === "held").length,
    earnings:  bookings.filter(b => b.status === "paid").reduce((a,b) => a + b.amountNGN, 0),
    slots:     templates.length,
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <div className="wrap">
        <BrandNav onSignOut={signOut} />

        {/* ── Stats row ── */}
        <div className="admin-summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, margin: "20px 0" }}>
          {[
            { icon: "✅", val: stats.confirmed,          label: "Confirmed",       color: "var(--teal)" },
            { icon: "⏳", val: stats.pending,            label: "Pending Payment", color: "var(--gold)" },
            { icon: "💰", val: ngn(stats.earnings),      label: "Total Earnings",  color: "var(--navy)" },
            { icon: "📆", val: `${templates.length} windows`, label: "Availability Windows", color: "var(--sky)" },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-icon">{s.icon}</div>
              <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
              <div className="stat-lbl">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="adminbar">
          {(["availability","bookings","settings"] as const).map(t => (
            <button key={t} className={"tabbtn" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>
              {t === "availability" ? "🗓 Availability" : t === "bookings" ? "📋 Bookings" : "⚙️ Settings"}
            </button>
          ))}
        </div>

        {/* ══════════════════════ AVAILABILITY ══════════════════════ */}
        {tab === "availability" && (
          <div className="avail-layout">

            {/* ── Weekly Schedule ── */}
            <div className="card">
              <div className="card-header">
                <div>
                  <h3>📅 Weekly Schedule</h3>
                  <p className="card-sub">Set which days and hours you're available each week. Clients can book slots within these windows.</p>
                </div>
              </div>

              <div className="week-grid">
                {DAYS.map(dayIdx => {
                  const dayTemplates = byDay.get(dayIdx) ?? [];
                  const isAdding = addingFor === dayIdx;
                  return (
                    <div key={dayIdx} className={"week-day-card" + (dayTemplates.length > 0 ? " active" : "")}>
                      <div className="week-day-head">
                        <span className="week-day-name">{DOW_FULL[dayIdx]}</span>
                        {dayTemplates.length > 0
                          ? <span className="week-day-badge">{dayTemplates.length} window{dayTemplates.length > 1 ? "s" : ""}</span>
                          : <span className="week-day-off">Off</span>
                        }
                      </div>

                      {/* Existing windows */}
                      <div className="week-windows">
                        {dayTemplates.map(t => (
                          <div key={t.id} className="week-window">
                            <span className="week-window-time">🕐 {t.start} – {t.end}</span>
                            <button className="week-window-del" onClick={async () => { await deleteTemplate(t.id); refresh(); }} title="Remove">✕</button>
                          </div>
                        ))}
                      </div>

                      {/* Add window inline */}
                      {isAdding ? (
                        <div className="week-add-form">
                          <div className="week-time-row">
                            <div>
                              <span className="lab">From</span>
                              <input type="time" value={newWindow.start} onChange={e => setNewWindow(p => ({ ...p, start: e.target.value }))} />
                            </div>
                            <div>
                              <span className="lab">To</span>
                              <input type="time" value={newWindow.end} onChange={e => setNewWindow(p => ({ ...p, end: e.target.value }))} />
                            </div>
                          </div>
                          <div className="week-add-actions">
                            <button className="btn btn-primary btn-sm" disabled={savingTpl} onClick={async () => {
                              if (!newWindow.start || !newWindow.end) return;
                              setSavingTpl(true);
                              await saveTemplate({ weekday: dayIdx, start: newWindow.start, end: newWindow.end, active: true });
                              await refresh();
                              setSavingTpl(false);
                              setAddingFor(null);
                            }}>
                              {savingTpl ? "Saving…" : "✓ Save"}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setAddingFor(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button className="week-add-btn" onClick={() => { setAddingFor(dayIdx); setNewWindow({ start: "09:00", end: "17:00" }); }}>
                          + Add hours
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Days Off & Extra Hours ── */}
            <div className="card">
              <div className="card-header">
                <div>
                  <h3>🚫 Days Off & Extra Hours</h3>
                  <p className="card-sub">
                    <strong>Day Off</strong> blocks a specific date completely — no bookings that day even if it normally has weekly hours. 
                    <strong> Extra Hours</strong> adds availability on a date that isn't normally in your weekly schedule.
                  </p>
                </div>
              </div>

              {/* Exceptions list */}
              {exceptions.length > 0 ? (
                <div className="exc-list">
                  {exceptions
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map(e => {
                      const d = new Date(e.date + "T00:00:00");
                      return (
                        <div key={e.id} className={"exc-row " + e.type}>
                          <div className={"exc-badge " + e.type}>
                            {e.type === "block" ? "🚫 Day Off" : "➕ Extra"}
                          </div>
                          <div className="exc-info">
                            <span className="exc-date">{DOW_SHORT[d.getDay()]}, {d.getDate()} {MON[d.getMonth()]} {d.getFullYear()}</span>
                            {e.type === "extra" && e.start && e.end && (
                              <span className="exc-time">{e.start} – {e.end}</span>
                            )}
                          </div>
                          <button className="week-window-del" onClick={async () => { await deleteException(e.id); refresh(); }} title="Remove">✕</button>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "0 0 16px" }}>No exceptions set. Your weekly schedule applies to all dates.</p>
              )}

              {/* Add exception */}
              <div className="exc-add">
                <div className="exc-add-row">
                  <div style={{ flex: "1 1 140px" }}>
                    <span className="lab">Date</span>
                    <input type="date" value={exc.date} onChange={e => setExc(p => ({ ...p, date: e.target.value }))} />
                  </div>
                  <div style={{ flex: "1 1 140px" }}>
                    <span className="lab">Type</span>
                    <select value={exc.type} onChange={e => setExc(p => ({ ...p, type: e.target.value as "block" | "extra" }))}>
                      <option value="block">🚫 Day Off — block this date</option>
                      <option value="extra">➕ Extra Hours — add availability</option>
                    </select>
                  </div>
                  {exc.type === "extra" && (
                    <>
                      <div style={{ flex: "0 0 110px" }}>
                        <span className="lab">From</span>
                        <input type="time" value={exc.start} onChange={e => setExc(p => ({ ...p, start: e.target.value }))} />
                      </div>
                      <div style={{ flex: "0 0 110px" }}>
                        <span className="lab">To</span>
                        <input type="time" value={exc.end} onChange={e => setExc(p => ({ ...p, end: e.target.value }))} />
                      </div>
                    </>
                  )}
                  <div style={{ display: "flex", alignItems: "flex-end", flexShrink: 0 }}>
                    <button className="btn btn-primary btn-sm" disabled={!exc.date}
                      onClick={async () => {
                        await addException({ date: exc.date, type: exc.type, start: exc.start, end: exc.end });
                        setExc({ date: "", type: "block", start: "", end: "" });
                        refresh();
                      }}>
                      + Add
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════ BOOKINGS ══════════════════════ */}
        {tab === "bookings" && (
          <div className="card">
            <div className="card-header" style={{ marginBottom: 16 }}>
              <div>
                <h3>📋 Bookings</h3>
                <p className="card-sub">{bookings.length} total · {stats.confirmed} confirmed · {stats.pending} pending</p>
              </div>
              <div className="filter-pills">
                {(["all","paid","held"] as const).map(f => (
                  <button key={f} className={"filter-pill" + (bookFilter === f ? " active" : "")} onClick={() => setBookFilter(f)}>
                    {f === "all" ? "All" : f === "paid" ? "✅ Confirmed" : "⏳ Pending"}
                  </button>
                ))}
              </div>
            </div>

            {filteredBookings.length === 0 ? (
              <div className="empty-state">
                <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
                <p style={{ color: "var(--muted)" }}>
                  {bookFilter === "all" ? "No bookings yet." : `No ${bookFilter === "paid" ? "confirmed" : "pending"} bookings.`}
                </p>
              </div>
            ) : (
              <div className="booking-list">
                {filteredBookings.map(b => {
                  const d = b.slotStart.toDate();
                  const end = b.slotEnd.toDate();
                  const isPast = d < new Date();
                  return (
                    <div key={b.id} className={"booking-card" + (isPast ? " past" : "")}>
                      <div className="booking-date-col">
                        <div className="booking-month">{MON[d.getMonth()]} {d.getFullYear()}</div>
                        <div className="booking-day">{d.getDate()}</div>
                        <div className="booking-dow">{DOW_SHORT[d.getDay()]}</div>
                      </div>
                      <div className="booking-info">
                        <div className="booking-time">
                          🕐 {d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })} – {end.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div className="booking-client">👤 {b.clientName}</div>
                        {b.clientEmail && <div className="booking-email">✉️ {b.clientEmail}</div>}
                        {b.topic && <div className="booking-topic">💬 {b.topic}</div>}
                      </div>
                      <div className="booking-right">
                        <div className="booking-amount">{ngn(b.amountNGN)}</div>
                        <span className={"status-pill " + b.status}>
                          {b.status === "paid" ? "✅ Confirmed" : b.status === "held" ? "⏳ Pending" : "❌ Cancelled"}
                        </span>
                        {b.status === "paid" && (
                          <Link className="btn btn-sm btn-primary" href={`/session/?id=${b.id}&role=practitioner`} style={{ marginTop: 8, textDecoration: "none" }}>
                            🎙 Join Session
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

        {/* ══════════════════════ SETTINGS ══════════════════════ */}
        {tab === "settings" && (
          <div className="card">
            <div className="card-header" style={{ marginBottom: 20 }}>
              <div>
                <h3>⚙️ Practice Settings</h3>
                <p className="card-sub">Configure your pricing, session length, and booking window.</p>
              </div>
            </div>
            <div className="settings-grid">
              {[
                { key: "practitionerName", label: "Practitioner Name", type: "text", hint: "Your name as displayed to clients" },
                { key: "priceNGN",         label: "Session Price (₦)",  type: "number", hint: "Amount charged per standard session" },
                { key: "sessionLengthMin", label: "Session Length (min)", type: "number", hint: "Duration of each consultation" },
                { key: "bufferMin",        label: "Buffer Between Sessions (min)", type: "number", hint: "Gap between back-to-back bookings" },
                { key: "bookingWindowDays",label: "Booking Window (days)", type: "number", hint: "How far ahead clients can book (currently 14 days)" },
              ].map(({ key, label, type, hint }) => (
                <div key={key} className="settings-field">
                  <label>{label}</label>
                  <input
                    type={type}
                    value={(settings as unknown as Record<string, unknown>)[key] as string | number}
                    onChange={e => setSettings({ ...settings, [key]: type === "number" ? +e.target.value : e.target.value })}
                  />
                  <span className="field-hint">{hint}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={saving}
              onClick={async () => { setSaving(true); await saveSettings(settings); setSaving(false); }}>
              {saving ? "Saving…" : "💾 Save Settings"}
            </button>
          </div>
        )}

        <div style={{ height: 48 }} />
      </div>
    </div>
  );
}
