"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  watchClientNotes, addClientNote, deleteClientNote, getClientBookingsById,
} from "@/lib/db";
import type { ClientNote } from "@/lib/db";
import type { Booking } from "@/lib/types";
import SignInForm from "@/components/SignInForm";

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDT = (d: Date) => `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} · ${d.toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"})}`;

export default function ClientDetailPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const clientId = params.clientId as string;

  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [clientBookings, setClientBookings] = useState<Booking[]>([]);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  useEffect(() => {
    if (!loading && role !== "practitioner") router.replace("/");
  }, [role, loading, router]);

  useEffect(() => {
    if (role !== "practitioner" || !clientId) return;
    getClientBookingsById(clientId).then(rows => {
      setClientBookings(rows);
      if (rows.length > 0) {
        setClientName(rows[0].clientName || "Unknown");
        setClientEmail(rows[0].clientEmail || "");
      }
    }).catch(console.warn);
  }, [role, clientId]);

  useEffect(() => {
    if (role !== "practitioner" || !clientId) return;
    return watchClientNotes(clientId, setNotes);
  }, [role, clientId]);

  const handleAddNote = useCallback(async () => {
    if (!noteText.trim() || !clientId) return;
    setSaving(true);
    try {
      await addClientNote(clientId, noteText.trim());
      setNoteText("");
    } catch (e) {
      console.warn("[addNote]", e);
    }
    setSaving(false);
  }, [noteText, clientId]);

  const handleDelete = useCallback(async (noteId: string) => {
    if (!confirm("Delete this note?")) return;
    try {
      await deleteClientNote(clientId, noteId);
    } catch (e) {
      console.warn("[deleteNote]", e);
    }
  }, [clientId]);

  if (loading || !user) return null;
  if (role !== "practitioner") return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <div className="wrap">
        <nav className="nav">
          <Link href="/" className="brand" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
            <div className="brand-icon">🩺</div>
            <div className="brand-text">
              <span>ConsultDrFat</span>
              <small>Practitioner Portal</small>
            </div>
          </Link>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link href="/p-dfta" className="btn btn-ghost btn-sm">Dashboard</Link>
          </div>
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0" }}>
          <Link href="/p-dfta" style={{ fontSize: 13, color: "var(--muted)", textDecoration: "none" }}>Dashboard</Link>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>/</span>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Clients</span>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{clientName || "Client"}</span>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg,var(--teal),var(--sky))",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, fontWeight: 700, color: "#fff",
            }}>{clientName?.[0]?.toUpperCase() ?? "?"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>{clientName || "Loading…"}</h2>
              {clientEmail && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>✉️ {clientEmail}</div>}
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                {clientBookings.length} session{clientBookings.length !== 1 ? "s" : ""} total
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div className="card" style={{ flex: 1, minWidth: 300 }}>
            <div className="card-header" style={{ marginBottom: 16 }}>
              <div>
                <h3>📝 Consultation Notes</h3>
                <p className="card-sub">Write notes about this client's consultations</p>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Write a consultation note…"
                style={{
                  width: "100%", minHeight: 80, padding: "12px 14px",
                  borderRadius: 12, border: "1px solid var(--line)",
                  fontSize: 14, fontFamily: "inherit", resize: "vertical",
                  background: "#fff", color: "var(--navy)", outline: "none",
                }}
                onFocus={e => e.currentTarget.style.borderColor = "var(--teal)"}
                onBlur={e => e.currentTarget.style.borderColor = "var(--line)"}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handleAddNote}
                disabled={saving || !noteText.trim()}
                style={{ marginTop: 8 }}
              >
                {saving ? "Saving…" : "+ Add Note"}
              </button>
            </div>

            {notes.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 14, textAlign: "center", padding: "20px 0" }}>
                No notes yet. Add your first consultation note above.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {notes.map(note => {
                  const d = note.createdAt?.toDate?.() ?? new Date();
                  return (
                    <div key={note.id} style={{
                      background: "#fff", border: "1px solid var(--line)",
                      borderRadius: 12, padding: "14px 16px",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--teal)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                          {DOW[d.getDay()]}, {d.getDate()} {MON[d.getMonth()]} {d.getFullYear()} · {d.toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"})}
                        </span>
                        <button
                          onClick={() => handleDelete(note.id)}
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: "var(--muted)", fontSize: 14, padding: 0, flexShrink: 0,
                          }}
                          onMouseOver={e => e.currentTarget.style.color = "#ef4444"}
                          onMouseOut={e => e.currentTarget.style.color = "var(--muted)"}
                          aria-label="Delete note"
                        >🗑</button>
                      </div>
                      <div style={{ fontSize: 14, color: "var(--navy)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                        {note.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card" style={{ flex: "0 0 320px", minWidth: 280 }}>
            <div className="card-header" style={{ marginBottom: 16 }}>
              <div>
                <h3>📋 Session History</h3>
                <p className="card-sub">{clientBookings.length} session{clientBookings.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            {clientBookings.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: "16px 0" }}>No sessions yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {clientBookings.map(b => {
                  const d = b.slotStart.toDate();
                  const isComplete = b.archived || !!b.completedAt;
                  return (
                    <div key={b.id} style={{
                      padding: "12px 14px", borderRadius: 10,
                      border: "1px solid var(--line)", background: "#fff",
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>{fmtDT(d)}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <span className={"status-pill " + b.status} style={{ fontSize: 10 }}>
                          {b.status === "paid" ? "✅ Paid" : b.status === "held" ? "⏳ Pending" : "❌ Cancelled"}
                        </span>
                        {isComplete && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>Completed</span>}
                        {b.topic && (
                          <span style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>💬 {b.topic}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div style={{ height: 48 }} />
      </div>
    </div>
  );
}
