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


// ── Main Admin Page ────────────────────────────────────────────────────────
export default function AdminPage() {
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

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <div className="wrap">
        <BrandNav onSignOut={signOut} />

        {/* Summary bar */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, margin: "20px 0" }}>
          {[
            { icon: "📅", val: bookings.filter(b => b.status === "paid").length, label: "Confirmed" },
            { icon: "⏳", val: bookings.filter(b => b.status === "held").length, label: "Pending Payment" },
            { icon: "💰", val: ngn(bookings.filter(b => b.status === "paid").reduce((a,b) => a + b.amountNGN, 0)), label: "Total Earnings" },
            { icon: "🗓", val: templates.length, label: "Weekly Slots" },
          ].map(s => (
            <div key={s.label} style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 16, padding: "16px 18px", boxShadow: "var(--shadow-sm)" }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)", lineHeight: 1.1 }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div className="adminbar">
          {(["availability", "bookings", "settings"] as const).map((t) => (
            <button key={t} className={"tabbtn" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>
              {t === "availability" ? "🗓 Availability" : t === "bookings" ? "📋 Bookings" : "⚙️ Settings"}
            </button>
          ))}
        </div>

        {/* ── AVAILABILITY ── */}
        {tab === "availability" && (
          <>
            <div className="card" style={{ marginBottom: 14 }}>
              <h3>📅 Weekly Schedule</h3>
              {templates.length === 0 && (
                <p style={{ color: "var(--muted)", fontSize: 14, margin: "8px 0" }}>No weekly hours set yet. Add your first slot below.</p>
              )}
              {templates.map((t) => (
                <div className="list-row" key={t.id}>
                  <span style={{ fontWeight: 600 }}>{DOW[t.weekday]}</span>
                  <span style={{ color: "var(--muted)", fontSize: 13 }}>{t.start} – {t.end}</span>
                  <button className="del" onClick={async () => { await deleteTemplate(t.id); refresh(); }}>Remove</button>
                </div>
              ))}
              <div className="rowflex" style={{ marginTop: 16 }}>
                <div>
                  <span className="lab">Day</span>
                  <select value={tpl.weekday} onChange={(e) => setTpl({ ...tpl, weekday: +e.target.value })}>
                    {DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
                <div><span className="lab">Start</span><input type="time" value={tpl.start} onChange={(e) => setTpl({ ...tpl, start: e.target.value })} /></div>
                <div><span className="lab">End</span><input type="time" value={tpl.end} onChange={(e) => setTpl({ ...tpl, end: e.target.value })} /></div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button className="btn btn-primary btn-sm" onClick={async () => { await saveTemplate({ weekday: tpl.weekday, start: tpl.start, end: tpl.end, active: true }); refresh(); }}>
                    + Add
                  </button>
                </div>
              </div>
            </div>

            <div className="card">
              <h3>🗓 Days Off & Extra Hours</h3>
              {exceptions.map((e) => (
                <div className="list-row" key={e.id}>
                  <span style={{ fontWeight: 600 }}>{e.date}</span>
                  <span style={{ color: "var(--muted)", fontSize: 13 }}>{e.type === "block" ? "Day off" : `Extra: ${e.start}–${e.end}`}</span>
                  <button className="del" onClick={async () => { await deleteException(e.id); refresh(); }}>Remove</button>
                </div>
              ))}
              <div className="rowflex" style={{ marginTop: 16 }}>
                <div><span className="lab">Date</span><input type="date" value={exc.date} onChange={(e) => setExc({ ...exc, date: e.target.value })} /></div>
                <div>
                  <span className="lab">Type</span>
                  <select value={exc.type} onChange={(e) => setExc({ ...exc, type: e.target.value as "block" | "extra" })}>
                    <option value="block">Day Off</option>
                    <option value="extra">Extra Hours</option>
                  </select>
                </div>
                {exc.type === "extra" && (
                  <>
                    <div><span className="lab">Start</span><input type="time" value={exc.start} onChange={(e) => setExc({ ...exc, start: e.target.value })} /></div>
                    <div><span className="lab">End</span><input type="time" value={exc.end} onChange={(e) => setExc({ ...exc, end: e.target.value })} /></div>
                  </>
                )}
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!exc.date}
                    onClick={async () => { await addException({ date: exc.date, type: exc.type, start: exc.start, end: exc.end }); refresh(); }}
                  >
                    + Add
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── BOOKINGS ── */}
        {tab === "bookings" && (
          <div className="card">
            <h3>📋 All Bookings</h3>
            {bookings.length === 0 && <p style={{ color: "var(--muted)", fontSize: 14 }}>No bookings yet.</p>}
            {bookings
              .sort((a, b) => a.slotStart.toMillis() - b.slotStart.toMillis())
              .map((b) => {
                const d = b.slotStart.toDate();
                return (
                  <div className="list-row" key={b.id} style={{ flexWrap: "wrap", gap: 6 }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{d.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" })}</span>{" "}
                      <span style={{ color: "var(--muted)", fontSize: 13 }}>{d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <span style={{ color: "var(--ink)", fontSize: 14 }}>{b.clientName}</span>
                    <span style={{ color: "var(--muted)", fontSize: 13 }}>{ngn(b.amountNGN)}</span>
                    <span className={`pill ${b.status}`}>{b.status}</span>
                    <Link className="btn btn-ghost btn-sm" href={`/session/?id=${b.id}&role=practitioner`}>🩺 Open Room</Link>
                  </div>
                );
              })}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === "settings" && (
          <div className="card">
            <h3>⚙️ Practice Settings</h3>
            <div className="rowflex" style={{ flexWrap: "wrap", marginBottom: 14 }}>
              <div style={{ flex: "1 1 180px" }}>
                <span className="lab">Practitioner Name</span>
                <input type="text" value={settings.practitionerName} onChange={(e) => setSettings({ ...settings, practitionerName: e.target.value })} />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <span className="lab">Session Price (₦)</span>
                <input type="number" value={settings.priceNGN} onChange={(e) => setSettings({ ...settings, priceNGN: +e.target.value })} />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <span className="lab">Session Length (min)</span>
                <input type="number" value={settings.sessionLengthMin} onChange={(e) => setSettings({ ...settings, sessionLengthMin: +e.target.value })} />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <span className="lab">Buffer Between (min)</span>
                <input type="number" value={settings.bufferMin} onChange={(e) => setSettings({ ...settings, bufferMin: +e.target.value })} />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <span className="lab">Booking Window (days)</span>
                <input type="number" value={settings.bookingWindowDays} onChange={(e) => setSettings({ ...settings, bookingWindowDays: +e.target.value })} />
              </div>
            </div>
            <button
              className="btn btn-primary"
              disabled={saving}
              onClick={async () => { setSaving(true); await saveSettings(settings); setSaving(false); }}
            >
              {saving ? "Saving…" : "💾 Save Settings"}
            </button>
          </div>
        )}

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}
