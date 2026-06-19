"use client";
/**
 * GlobalShell — rendered in layout.tsx wrapping all pages.
 * Provides:
 *   - Floating "Return to session" bubble (follows user across all pages)
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getClientBookings, getLiveSession } from "@/lib/db";

export default function GlobalShell({ children }: { children: React.ReactNode }) {
  const { user, role } = useAuth();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [bubbleExpanded, setBubbleExpanded] = useState(true);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check for active live session every 30s
  useEffect(() => {
    if (!user || role !== "client") { setActiveSessionId(null); return; }

    const check = async () => {
      try {
        const bookings = await getClientBookings(user.uid);
        for (const b of bookings) {
          const sess = await getLiveSession(b.id).catch(() => null);
          if (sess?.status === "live") {
            setActiveSessionId(b.id);
            return;
          }
        }
        setActiveSessionId(null);
      } catch { setActiveSessionId(null); }
    };

    check();
    const iv = setInterval(check, 30_000);
    return () => clearInterval(iv);
  }, [user, role]);

  // Auto-collapse label after 4s
  useEffect(() => {
    if (!activeSessionId) return;
    setBubbleExpanded(true);
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => setBubbleExpanded(false), 4000);
    return () => { if (collapseTimer.current) clearTimeout(collapseTimer.current); };
  }, [activeSessionId]);

  return (
    <>
      {children}

      {/* ── Floating "Return to session" bubble ── */}
      {activeSessionId && (
        <Link
          href={`/session/?id=${activeSessionId}&role=client`}
          onClick={() => { setBubbleExpanded(true); }}
          style={{
            position: "fixed",
            bottom: 24,
            right: 20,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "linear-gradient(135deg, #00b4b4 0%, #0B2B4A 100%)",
            borderRadius: 48,
            boxShadow: "0 6px 28px rgba(0,180,180,.4), 0 2px 8px rgba(0,0,0,.18)",
            padding: bubbleExpanded ? "12px 20px 12px 14px" : "12px 14px",
            textDecoration: "none",
            transition: "padding .35s ease",
            cursor: "pointer",
          }}
        >
          {/* White headphone icon with pulse ring */}
          <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, flexShrink: 0 }}>
            <span style={{
              position: "absolute", width: 28, height: 28, borderRadius: "50%",
              background: "rgba(255,255,255,.2)",
              animation: "pulse 1.6s ease-in-out infinite",
            }} />
            <span style={{ fontSize: 20, filter: "brightness(0) invert(1)" }}>🎧</span>
          </span>
          {/* Animated label */}
          <span style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            whiteSpace: "nowrap",
            maxWidth: bubbleExpanded ? 180 : 0,
            overflow: "hidden",
            opacity: bubbleExpanded ? 1 : 0,
            transition: "max-width .4s ease, opacity .3s ease",
          }}>
            Return to session
          </span>
        </Link>
      )}
    </>
  );
}
