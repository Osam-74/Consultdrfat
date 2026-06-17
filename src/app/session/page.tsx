"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Role } from "@/lib/types";
import SessionRoom from "@/components/SessionRoom";

import SignInForm from "@/components/SignInForm";

function SignInGate() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", display: "flex", flexDirection: "column" }}>
      <div className="wrap">
        <nav className="nav">
          <div className="brand">
            <div className="brand-icon">🩺</div>
            <div className="brand-text"><span>ConsultDrFat</span><small>Session Room</small></div>
          </div>
        </nav>
      </div>
      <div className="center" style={{ flex: 1 }}>
        <SignInForm />
      </div>
    </div>
  );
}

export default function SessionPage() {
  const { user, role: authRole, loading } = useAuth();
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

  if (!user) return <SignInGate />;

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
