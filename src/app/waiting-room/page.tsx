"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { watchWaitingRoom } from "@/lib/db";
import { Booking } from "@/lib/types";

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDT(d: Date) {
  return `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} · ${d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}`;
}
function timeDiff(ms: number) {
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.floor(abs / 60000);
  const hrs = Math.floor(mins / 60);
  if (diff < 0) return mins < 60 ? `${mins}m ago` : `${hrs}h ago`;
  return mins < 60 ? `in ${mins}m` : `in ${hrs}h ${mins % 60}m`;
}

type SessStatus = "none" | "idle" | "live" | "complete";

export default function WaitingRoomPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const [clients, setClients] = useState<Booking[]>([]);
  const [statuses, setStatuses] = useState<Record<string, SessStatus>>({});
  const [now, setNow] = useState(Date.now());

  // Redirect non-practitioners
  useEffect(() => {
    if (!loading && role !== "practitioner") router.replace("/");
  }, [role, loading, router]);

  // Live clock
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  // Watch waiting room — use cached sessionStatus on booking doc (zero extra reads)
  useEffect(() => {
    if (role !== "practitioner") return;
    const unsub = watchWaitingRoom((rows) => {
      setClients(rows);
      const s: Record<string, SessStatus> = {};
      rows.forEach((b) => {
        const cached = (b as unknown as Record<string, unknown>).sessionStatus as string | undefined;
        if (cached === "live") s[b.id] = "live";
        else if (cached === "complete") s[b.id] = "complete";
        else if (cached === "idle") s[b.id] = "idle";
        else s[b.id] = "none";
      });
      setStatuses(s);
    });
    return unsub;
  }, [role]);

  if (loading || !user) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <div className="wrap">
        {/* Nav */}
        <nav className="nav">
          <Link href="/" className="brand" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
            <div className="brand-icon">🩺</div>
            <div className="brand-text">
              <span>ConsultDrFat</span>
              <small>Waiting Room</small>
            </div>
          </Link>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link href="/p-dfta" className="btn btn-ghost btn-sm">Dashboard</Link>
          </div>
        </nav>

        <div className="page-head" style={{ marginBottom: 24 }}>
          <div className="lbl">🚪 Waiting Room</div>
          <h1 style={{ marginTop: 4 }}>Clients Waiting</h1>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
            {clients.length === 0
              ? "No clients in the waiting window right now."
              : `${clients.length} client${clients.length !== 1 ? "s" : ""} in the next 8 hours`}
          </p>
        </div>

        {clients.length === 0 ? (
          <div className="empty-state" style={{ paddingTop: 60 }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🪑</div>
            <p style={{ color: "var(--muted)", fontSize: 15 }}>No clients scheduled in the next 8 hours.</p>
            <Link href="/p-dfta" className="btn btn-primary" style={{ marginTop: 16 }}>Back to Dashboard</Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 48 }}>
            {clients.map((b) => {
              const d = b.slotStart.toDate();
              const slotMs = b.slotStart.toMillis();
              const sess = statuses[b.id] ?? "none";
              const isLive = sess === "live";
              const isComplete = sess === "complete";
              const isPast = slotMs < now;
              const isWithin15 = slotMs - now < 15 * 60 * 1000;

              return (
                <div key={b.id} style={{
                  background: "#fff",
                  borderRadius: 16,
                  border: isLive
                    ? "2px solid #4ade80"
                    : isPast
                      ? "1px solid #fed7aa"
                      : "1px solid var(--line)",
                  boxShadow: isLive ? "0 4px 20px rgba(74,222,128,.15)" : "0 2px 8px rgba(0,0,0,.05)",
                  padding: "20px 24px",
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  flexWrap: "wrap",
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
                    background: isLive ? "linear-gradient(135deg,#4ade80,#22d3ee)" : "var(--teal-soft)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22, fontWeight: 700, color: isLive ? "#fff" : "var(--teal)",
                  }}>
                    {b.clientName?.[0]?.toUpperCase() ?? "?"}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 16, color: "var(--navy)" }}>
                        {b.clientName ?? "Unknown"}
                      </span>
                      {isLive && (
                        <span style={{ background: "#dcfce7", color: "#166534", fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "2px 10px", display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 1.5s infinite" }} />
                          Live
                        </span>
                      )}
                      {isComplete && (
                        <span style={{ background: "#f1f5f9", color: "var(--muted)", fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "2px 10px" }}>
                          Complete
                        </span>
                      )}
                      {isPast && !isLive && !isComplete && (
                        <span style={{ background: "#fff7ed", color: "#c2410c", fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "2px 10px" }}>
                          Overdue
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 2 }}>
                      📅 {fmtDT(d)} &nbsp;·&nbsp; <span style={{ fontWeight: 600, color: isPast ? "#c2410c" : "var(--teal)" }}>{timeDiff(slotMs)}</span>
                    </div>
                    {b.topic && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                        💬 {b.topic}
                      </div>
                    )}
                    {b.clientEmail && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                        ✉️ {b.clientEmail}
                      </div>
                    )}
                  </div>

                  {/* Action */}
                  <div style={{ flexShrink: 0 }}>
                    {isComplete ? (
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>Session ended</span>
                    ) : (
                      <Link
                        href={`/session/?id=${b.id}&role=practitioner`}
                        className="btn btn-primary"
                        style={{
                          background: isLive
                            ? "linear-gradient(135deg,#22c55e,#16a34a)"
                            : !isWithin15
                              ? "var(--muted)"
                              : undefined,
                          cursor: !isWithin15 && !isLive ? "default" : "pointer",
                        }}
                      >
                        {isLive ? "Rejoin session →" : isWithin15 ? "Start session →" : "Not yet"}
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
