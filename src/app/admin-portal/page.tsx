"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  getSettings, saveSettings, getTemplates, saveTemplate, deleteTemplate,
  getExceptions, addException, deleteException, watchBookings,
} from "@/lib/db";
import {
  PracticeSettings, DEFAULT_SETTINGS, AvailabilityTemplate, AvailabilityException, Booking,
} from "@/lib/types";
import SignInForm from "@/components/SignInForm";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ngn = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);

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

export default function AdminPortalPage() {
  const { user, role, loading, signOut } = useAuth();
  const [tab, setTab] = useState<"availability" | "bookings" | "settings">("availability");
  const [settings, setSettings] = useState<PracticeSettings>(DEFAULT_SETTINGS);
  const [templates, setTemplates] = useState<AvailabilityTemplate[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [saving, setSaving] = useState(false);

  const [tpl, setTpl] = useState({ weekday: 1, start: "09:00", end: "13:00" });
  const [exc, setExc] = useState({ date: "", type: "block" as "block" | "extra", start: "", end: "" });

  const refresh = async () => {
    setSettings(await getSettings());
    setTemplates(await getTemplates());
    setExceptions(await getExceptions());
  };
  useEffect(() => { if (role === "practitioner") refresh(); }, [role]);
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
      <p>This portal is for the registered practitioner only. Your account does not have practitioner access.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <Link className="btn btn-primary" href="/book/">📅 Book a Consultation</Link>
        <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
      </div>
    </div>
  );

  const save = async () => {
    setSaving(true);
    await saveSettings(settings);
    setSaving(false);
  };
  const addTpl = async () => {
    await saveTemplate({ weekday: tpl.weekday, start: tpl.start, end: tpl.end, active: true });
    await refresh();
  };
  const removeTpl = async (id: string) => { await deleteTemplate(id); await refresh(); };
  const addExc = async () => {
    if (!exc.date) return;
    await addException({ date: exc.date, type: exc.type, start: exc.start || undefined, end: exc.end || undefined });
    setExc({ date: "", type: "block", start: "", end: "" }); await refresh();
  };
  const removeExc = async (id: string) => { await deleteException(id); await refresh(); };

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <div className="wrap">
        <BrandNav onSignOut={signOut} />

        {/* Summary bar */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, margin: "20px 0" }}>
          {[
            { icon: "📅", val: bookings.filter(b => b.status === "paid").length, label: "Confirmed" },
            { icon: "⏳", val: bookings.filter(b => b.status === "held").length, label: "Pending Payment" },
            { icon: "💰", val: ngn(bookings.filter(b => b.status === "paid").reduce((a,b) => a + b.amountNGN, 0)), label: "Total Earnings" },
            { icon: "🗓", val: ngn(settings.priceNGN), label: "Current Rate" },
          ].map(s => (
            <div key={s.label} className="panel" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--navy)", fontFamily: "var(--font-pjs),sans-serif" }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="adminbar">
          {(["availability", "bookings", "settings"] as const).map(t => (
            <button key={t} className={`tabbtn${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
              {t === "availability" ? "📅 Availability" : t === "bookings" ? "📋 Bookings" : "⚙️ Settings"}
            </button>
          ))}
        </div>

        {/* ─ AVAILABILITY ─ */}
        {tab === "availability" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 40 }}>
            <div className="panel">
              <h3>Weekly Availability</h3>
              <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label>Day</label>
                  <select value={tpl.weekday} onChange={e => setTpl(p => ({ ...p, weekday: +e.target.value }))}>
                    {DOW.map((d,i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 100 }}>
                  <label>From</label>
                  <input type="time" value={tpl.start} onChange={e => setTpl(p => ({ ...p, start: e.target.value }))} />
                </div>
                <div style={{ flex: 1, minWidth: 100 }}>
                  <label>To</label>
                  <input type="time" value={tpl.end} onChange={e => setTpl(p => ({ ...p, end: e.target.value }))} />
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={addTpl}>+ Add Hours</button>
              <div style={{ marginTop: 16 }}>
                {templates.map(t => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ fontSize: 14 }}>{DOW[t.weekday]} · {t.start} – {t.end}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => removeTpl(t.id!)}>Remove</button>
                  </div>
                ))}
                {templates.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 12 }}>No availability set yet.</p>}
              </div>
            </div>

            <div className="panel">
              <h3>Days Off / Extra Hours</h3>
              <div style={{ marginBottom: 14 }}>
                <label>Date</label>
                <input type="date" value={exc.date} onChange={e => setExc(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label>Type</label>
                <select value={exc.type} onChange={e => setExc(p => ({ ...p, type: e.target.value as "block" | "extra" }))}>
                  <option value="block">Day Off (block)</option>
                  <option value="extra">Extra Hours</option>
                </select>
              </div>
              {exc.type === "extra" && (
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}><label>From</label><input type="time" value={exc.start} onChange={e => setExc(p => ({ ...p, start: e.target.value }))} /></div>
                  <div style={{ flex: 1 }}><label>To</label><input type="time" value={exc.end} onChange={e => setExc(p => ({ ...p, end: e.target.value }))} /></div>
                </div>
              )}
              <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={addExc}>+ Add Exception</button>
              <div style={{ marginTop: 16 }}>
                {exceptions.map(e => (
                  <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ fontSize: 14 }}>{e.date} · {e.type === "block" ? "🚫 Day off" : `➕ Extra ${e.start}–${e.end}`}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => removeExc(e.id!)}>Remove</button>
                  </div>
                ))}
                {exceptions.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 12 }}>No exceptions set.</p>}
              </div>
            </div>
          </div>
        )}

        {/* ─ BOOKINGS ─ */}
        {tab === "bookings" && (
          <div style={{ marginBottom: 40 }}>
            {bookings.length === 0 && <p style={{ color: "var(--muted)", padding: "32px 0", textAlign: "center" }}>No bookings yet.</p>}
            {bookings.map(b => {
              const start = b.slotStart?.toDate ? b.slotStart.toDate() : new Date(b.slotStart as unknown as string);
              return (
                <div key={b.id} className="card" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{b.clientName || b.clientId}</div>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>
                      {start.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })} · {ngn(b.amountNGN)}
                    </div>
                    {b.topic && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>Topic: {b.topic}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{
                      padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                      background: b.status === "paid" ? "var(--teal-soft)" : "var(--gold-soft)",
                      color: b.status === "paid" ? "var(--teal)" : "var(--gold)",
                    }}>
                      {b.status === "paid" ? "✅ Confirmed" : b.status === "held" ? "⏳ Pending" : b.status}
                    </span>
                    {b.status === "paid" && (
                      <Link href={`/session/?id=${b.id}`} className="btn btn-primary btn-sm">Open Room →</Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─ SETTINGS ─ */}
        {tab === "settings" && (
          <div style={{ maxWidth: 500, marginBottom: 40 }}>
            <div className="panel">
              <h3>Practice Settings</h3>
              <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
                <div>
                  <label>Session Price (₦)</label>
                  <input type="number" value={settings.priceNGN} onChange={e => setSettings(p => ({ ...p, priceNGN: +e.target.value }))} min={500} />
                </div>
                <div>
                  <label>Session Length (minutes)</label>
                  <input type="number" value={settings.sessionLengthMin} onChange={e => setSettings(p => ({ ...p, sessionLengthMin: +e.target.value }))} min={15} max={120} />
                </div>
                <div>
                  <label>Buffer Between Sessions (minutes)</label>
                  <input type="number" value={settings.bufferMin} onChange={e => setSettings(p => ({ ...p, bufferMin: +e.target.value }))} min={0} max={60} />
                </div>
                <div>
                  <label>Booking Window (days ahead)</label>
                  <input type="number" value={settings.bookingWindowDays} onChange={e => setSettings(p => ({ ...p, bookingWindowDays: +e.target.value }))} min={1} max={60} />
                </div>
                <div>
                  <label>Practice Name</label>
                  <input type="text" value={settings.practitionerName || ""} onChange={e => setSettings(p => ({ ...p, name: e.target.value }))} placeholder="ConsultDrFat" />
                </div>
                <button className="btn btn-primary" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "💾 Save Settings"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
