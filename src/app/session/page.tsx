"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Role } from "@/lib/types";
import SessionRoom from "@/components/SessionRoom";

export default function SessionPage() {
  const { user, role: authRole, loading, signIn } = useAuth();
  const [params, setParams] = useState<{ id: string; role: Role } | null>(null);

  // Read query params on the client (keeps the page statically exportable).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("id") || "";
    const role = (q.get("role") as Role) || "client";
    setParams(id ? { id, role } : null);
  }, []);

  if (loading || !params) return <div className="center"><p>Loading session…</p></div>;

  if (!user) {
    return (
      <div className="center">
        <h2>Sign in to join your session</h2>
        <button className="btn btn-amber" onClick={() => signIn()}>Continue with Google</button>
      </div>
    );
  }

  // The signed-in account decides the true role; the query param is a hint only.
  const role: Role = authRole ?? params.role;
  if (!params.id) {
    return <div className="center"><h2>Session not found</h2><Link className="btn btn-amber" href="/">Home</Link></div>;
  }

  return <SessionRoom bookingId={params.id} role={role} />;
}
