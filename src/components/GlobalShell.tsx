"use client";
/**
 * GlobalShell — rendered in layout.tsx wrapping all pages.
 * - Floating "Return to session" bubble (hidden on /session page and when session complete)
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getClientBookings, watchSession } from "@/lib/db";

export default function GlobalShell({ children }: { children: React.ReactNode }) {
  const { user, role } = useAuth();
  const pathname = usePathname();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [bubbleExpanded, setBubbleExpanded] = useState(true);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionUnsubRef = useRef<(() => void) | null>(null);

  // Hide bubble on session page — user is already there
  const onSessionPage = pathname?.startsWith("/session");

  // Find the client's active booking, then watch the session doc in real-time
  useEffect(() => {
    if (!user || role !== "client") {
      setActiveSessionId(null);
      if (sessionUnsubRef.current) { sessionUnsubRef.current(); sessionUnsubRef.current = null; }
      return;
    }

    let cancelled = false;

    const setup = async () => {
      try {
        const bookings = await getClientBookings(user.uid);
        if (cancelled) return;

        // Unsubscribe any previous session watcher
        if (sessionUnsubRef.current) { sessionUnsubRef.current(); sessionUnsubRef.current = null; }

        // Find the most recent paid non-archived booking
        const active = bookings.find((b) => b.status === "paid" && !b.archived);
        if (!active) { setActiveSessionId(null); return; }

        // Use cached sessionStatus on the booking doc first (no extra read).
        // Only open a real-time watchSession listener if the booking status is ambiguous.
        const cachedStatus = (active as unknown as Record<string, unknown>).sessionStatus as string | undefined;
        if (cachedStatus === "complete") { setActiveSessionId(null); return; }
        if (cachedStatus === "live")     { setActiveSessionId(active.id); return; }

        // Ambiguous — open a one-time session doc watch, cancel after first result
        const unsub = watchSession(active.id, (sess) => {
          if (!sess || sess.status === "complete" || sess.status === "idle") {
            setActiveSessionId(null);
          } else if (sess.status === "live") {
            setActiveSessionId(active.id);
          }
          // Unsubscribe after first read to avoid a permanent listener
          unsub();
          if (sessionUnsubRef.current === unsub) sessionUnsubRef.current = null;
        });
        sessionUnsubRef.current = unsub;
      } catch {
        setActiveSessionId(null);
      }
    };

    setup();
    // Poll every 5 minutes — enough for the "Return to session" bubble UX
    const iv = setInterval(setup, 5 * 60_000);

    return () => {
      cancelled = true;
      clearInterval(iv);
      if (sessionUnsubRef.current) { sessionUnsubRef.current(); sessionUnsubRef.current = null; }
    };
  }, [user, role]);

  // Auto-collapse label after 4s when bubble appears
  useEffect(() => {
    if (!activeSessionId) return;
    setBubbleExpanded(true);
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => setBubbleExpanded(false), 4000);
    return () => { if (collapseTimer.current) clearTimeout(collapseTimer.current); };
  }, [activeSessionId]);

  const showBubble = activeSessionId && !onSessionPage;

  return (
    <>
      {children}

      {showBubble && (
        <Link
          href={`/session/?id=${activeSessionId}&role=client`}
          onClick={() => setBubbleExpanded(true)}
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
          <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, flexShrink: 0 }}>
            <span style={{
              position: "absolute", width: 28, height: 28, borderRadius: "50%",
              background: "rgba(255,255,255,.2)",
              animation: "pulse 1.6s ease-in-out infinite",
            }} />
            <span style={{ fontSize: 20, filter: "brightness(0) invert(1)" }}>🎧</span>
          </span>
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
