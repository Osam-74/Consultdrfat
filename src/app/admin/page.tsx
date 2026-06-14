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

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ngn = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);

export default function AdminPage() {
  const { user, role, loading, signIn, signOut } = useAuth();
  const [tab, setTab] = useState<"availability" | "bookings" | "settings">("availability");
  const [settings, setSettings] = useState<PracticeSettings>(DEFAULT_SETTINGS);
  const [templates, setTemplates] = useState<AvailabilityTemplate[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  // form state
  const [tpl, setTpl] = useState({ weekday: 1, start: "09:00", end: "13:00" });
  const [exc, setExc] = useState({ date: "", type: "block" as "block" | "extra", start: "", end: "" });

  const refresh = async () => {
    setSettings(await getSettings());
    setTemplates(await getTemplates());
    setExceptions(await getExceptions());
  };
  useEffect(() => { if (role === "practitioner") refresh(); }, [role]);
  useEffect(() => { if (role === "practitioner") return watchBookings(setBookings); }, [role]);

  if (loading) return <div className="center"><p>Loading…</p></div>;
  if (!user) return (
    <div className="center">
      <h2>Practitioner sign in</h2>
      <p>Sign in with the practitioner account to manage your practice.</p>
      <button className="btn btn-amber" onClick={() => signIn()}>Continue with Google</button>
    </div>
  );
  if (role !== "practitioner") return (
    <div className="center">
      <h2>Not authorised</h2>
      <p>This area is for the practitioner. You’re signed in as a client.</p>
      <Link className="btn btn-amber" href="/book/">Book a session instead</Link>
    </div>
  );

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand"><span className="m">M</span>MindBridge · Admin</div>
        <button className="btn btn-ghost" style={{ padding: "8px 16px" }} onClick={() => signOut()}>Sign out</button>
      </div>

      <div className="adminbar">
        {(["availability", "bookings", "settings"] as const).map((t) => (
          <button key={t} className={"tabbtn" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "availability" && (
        <>
          <div className="card">
            <h3>Weekly availability</h3>
            {templates.length === 0 && <p style={{ color: "var(--muted)", fontSize: 14 }}>No weekly hours yet.</p>}
            {templates.map((t) => (
              <div className="list-row" key={t.id}>
                <span>{DOW[t.weekday]} · {t.start}–{t.end}</span>
                <button className="del" onClick={async () => { await deleteTemplate(t.id); refresh(); }}>Remove</button>
              </div>
            ))}
            <div className="rowflex" style={{ marginTop: 14 }}>
              <div><span className="lab">Day</span>
                <select value={tpl.weekday} onChange={(e) => setTpl({ ...tpl, weekday: Number(e.target.value) })}>
                  {DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div><span className="lab">From</span><input type="time" value={tpl.start} onChange={(e) => setTpl({ ...tpl, start: e.target.value })} /></div>
              <div><span className="lab">To</span><input type="time" value={tpl.end} onChange={(e) => setTpl({ ...tpl, end: e.target.value })} /></div>
              <button className="btn btn-amber" onClick={async () => { await saveTemplate({ ...tpl, active: true }); refresh(); }}>Add</button>
            </div>
          </div>

          <div className="card">
            <h3>Exceptions (days off / extra hours)</h3>
            {exceptions.map((e) => (
              <div className="list-row" key={e.id}>
                <span>{e.date} · {e.type}{e.start ? ` ${e.start}–${e.end}` : " (whole day)"}</span>
                <button className="del" onClick={async () => { await deleteException(e.id); refresh(); }}>Remove</button>
              </div>
            ))}
            <div className="rowflex" style={{ marginTop: 14 }}>
              <div><span className="lab">Date</span><input type="date" value={exc.date} onChange={(e) => setExc({ ...exc, date: e.target.value })} /></div>
              <div><span className="lab">Type</span>
                <select value={exc.type} onChange={(e) => setExc({ ...exc, type: e.target.value as "block" | "extra" })}>
                  <option value="block">Block</option><option value="extra">Extra hours</option>
                </select>
              </div>
              <div><span className="lab">From</span><input type="time" value={exc.start} onChange={(e) => setExc({ ...exc, start: e.target.value })} /></div>
              <div><span className="lab">To</span><input type="time" value={exc.end} onChange={(e) => setExc({ ...exc, end: e.target.value })} /></div>
              <button className="btn btn-amber" disabled={!exc.date} onClick={async () => {
                await addException({ date: exc.date, type: exc.type, ...(exc.start ? { start: exc.start, end: exc.end } : {}) });
                setExc({ date: "", type: "block", start: "", end: "" }); refresh();
              }}>Add</button>
            </div>
          </div>
        </>
      )}

      {tab === "bookings" && (
        <div className="card">
          <h3>Bookings</h3>
          {bookings.length === 0 && <p style={{ color: "var(--muted)", fontSize: 14 }}>No bookings yet.</p>}
          {bookings.map((b) => (
            <div className="list-row" key={b.id}>
              <span>
                {b.slotStart.toDate().toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {" · "}{b.clientName} <span className={"pill " + b.status}>{b.status}</span>
              </span>
              <Link href={`/session/?id=${b.id}&role=practitioner`} style={{ color: "var(--teal)", fontSize: 13.5 }}>Open room →</Link>
            </div>
          ))}
        </div>
      )}

      {tab === "settings" && (
        <div className="card">
          <h3>Practice settings</h3>
          <div className="rowflex">
            <div><span className="lab">Practitioner name</span><input type="text" value={settings.practitionerName} onChange={(e) => setSettings({ ...settings, practitionerName: e.target.value })} /></div>
            <div><span className="lab">Price (₦)</span><input type="number" value={settings.priceNGN} onChange={(e) => setSettings({ ...settings, priceNGN: Number(e.target.value) })} /></div>
          </div>
          <div className="rowflex" style={{ marginTop: 12 }}>
            <div><span className="lab">Session length (min)</span><input type="number" value={settings.sessionLengthMin} onChange={(e) => setSettings({ ...settings, sessionLengthMin: Number(e.target.value) })} /></div>
            <div><span className="lab">Buffer (min)</span><input type="number" value={settings.bufferMin} onChange={(e) => setSettings({ ...settings, bufferMin: Number(e.target.value) })} /></div>
            <div><span className="lab">Booking window (days)</span><input type="number" value={settings.bookingWindowDays} onChange={(e) => setSettings({ ...settings, bookingWindowDays: Number(e.target.value) })} /></div>
          </div>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "12px 0" }}>Current fee: <b>{ngn(settings.priceNGN)}</b></p>
          <button className="btn btn-amber" onClick={() => saveSettings(settings)}>Save settings</button>
        </div>
      )}
    </div>
  );
}
