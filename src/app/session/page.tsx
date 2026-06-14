"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Role } from "@/lib/types";
import SessionRoom from "@/components/SessionRoom";

export default function SessionPage() {
  const { user, role: authRole, loading, signIn } = useAuth();
  const [params, setParams] = useState<{ id: string; role: Role } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("id") || "";
    const role = (q.get("role") as Role) || "client";
    setParams(id ? { id, role } : null);
  }, []);

  if (loading || !params) return (
    <div className="center" style={{ minHeight: "100vh" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🩺</div>
      <p style={{ color: "var(--muted)" }}>Loading your session room…</p>
    </div>
  );

  if (!user) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
        <div className="wrap">
          <nav className="nav">
            <div className="brand">
              <div className="brand-icon">🩺</div>
              <div className="brand-text"><span>ConsultDrFat</span><small>Session Room</small></div>
            </div>
          </nav>
        </div>
        <div className="center" style={{ minHeight: "70vh" }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🔒</div>
          <h2>Sign in to join your session</h2>
          <p>Sign in with the Google account you used to book your consultation.</p>
          <button className="btn btn-primary btn-lg" onClick={() => signIn()}>
            🔒 Continue with Google
          </button>
        </div>
      </div>
    );
  }

  const role: Role = authRole ?? params.role;
  if (!params.id) {
    return (
      <div className="center" style={{ minHeight: "100vh" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
        <h2>Session Not Found</h2>
        <p>This session link may be invalid or expired.</p>
        <Link className="btn btn-primary" href="/">← Back to Home</Link>
      </div>
    );
  }

  return <SessionRoom bookingId={params.id} role={role} />;
}
