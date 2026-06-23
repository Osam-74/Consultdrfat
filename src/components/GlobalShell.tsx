"use client";
/**
 * GlobalShell — rendered in layout.tsx wrapping all pages.
 *
 * Shows a floating "Return to session" bubble for the client when:
 *   1. The client has a paid booking whose sessionStatus is "live" (practitioner started it), AND
 *   2. The actual session document status is NOT "complete" (practitioner has not ended it).
 *
 * The bubble disappears as soon as the practitioner ends the session.
 * It is hidden on the /session page (the client is already there).
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
  // Track session watcher so we can clean it up when booking changes
  const sessionUnsubRef = useRef<(() => void) | null>(null);

  const onSessionPage = pathname?.startsWith("/session");

  useEffect(() => {
    if (!user || role !== "client") {
      setActiveSessionId(null);
      return;
    }

    let mounted = true;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const check = async () => {
      try {
        const bookings = await getClientBookings(user.uid);
        if (!mounted) return;

        // Find a booking the practitioner has started (sessionStatus === "live")
        const liveBooking = bookings.find(
          (b) =>
            b.status === "paid" &&
            !b.archived &&
            (b as unknown as Record<string, unknown>).sessionStatus === "live"
        );

        if (!liveBooking) {
          // Clean up any existing session watcher
          if (sessionUnsubRef.current) { sessionUnsubRef.current(); sessionUnsubRef.current = null; }
          if (mounted) setActiveSessionId(null);
          return;
        }

        const bookingId = liveBooking.id;

        // If we're already watching this exact session, skip re-subscribing
        if (activeSessionId === bookingId) return;

        // Clean up old watcher
        if (sessionUnsubRef.current) { sessionUnsubRef.current(); sessionUnsubRef.current = null; }

        // Watch the session document directly — only show bubble while status !== "complete"
        sessionUnsubRef.current = watchSession(bookingId, (session) => {
          if (!mounted) return;
          if (!session || session.status === "complete") {
            setActiveSessionId(null);
          } else {
            setActiveSessionId(bookingId);
          }
        });
      } catch { /* non-fatal */ }
    };

    check();
    // Re-check every 30 seconds so we pick up newly started sessions
    pollInterval = setInterval(check, 30_000);

    return () => {
      mounted = false;
      if (pollInterval) clearInterval(pollInterval);
      if (sessionUnsubRef.current) { sessionUnsubRef.current(); sessionUnsubRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, role]);

  // Auto-collapse label after 5s when bubble first appears
  useEffect(() => {
    if (!activeSessionId) return;
    setBubbleExpanded(true);
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => setBubbleExpanded(false), 5000);
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
          {/* Pulsing icon */}
          <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, flexShrink: 0 }}>
            <span style={{
              position: "absolute", width: 28, height: 28, borderRadius: "50%",
              background: "rgba(255,255,255,.22)",
              animation: "pulse 1.6s ease-in-out infinite",
            }} />
            {/* Phone icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white" style={{ position: "relative", zIndex: 1 }}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.47 2 2 0 0 1 3.59 1.3h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.29 6.29l1.02-.88a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </span>
          {/* Label — collapses after 5s */}
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
