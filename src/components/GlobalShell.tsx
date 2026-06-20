"use client";
/**
 * GlobalShell — rendered in layout.tsx wrapping all pages.
 * - Floating "Return to session" bubble (hidden on /session page and when session complete)
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getClientBookings } from "@/lib/db";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function GlobalShell({ children }: { children: React.ReactNode }) {
  const { user, role } = useAuth();
  const pathname = usePathname();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [bubbleExpanded, setBubbleExpanded] = useState(true);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hide bubble on session page — user is already there
  const onSessionPage = pathname?.startsWith("/session");

  // Find the client's active booking, then watch the session doc in real-time
  useEffect(() => {
    if (!user || role !== "client") {
      setActiveSessionId(null);
      return;
    }

    let cancelled = false;

    const setup = async () => {
      try {
        const bookings = await getClientBookings(user.uid);
        if (cancelled) return;

        // Unsubscribe any previous session watcher
  
        // Find the most recent paid non-archived booking
        const active = bookings.find((b) => b.status === "paid" && !b.archived);
        if (!active) { setActiveSessionId(null); return; }

        // The floating headphone should ONLY appear when the practitioner has
        // started the session and it's currently live. Not on fresh bookings,
        // not on upcoming sessions, not on completed sessions.
        const cachedStatus = (active as unknown as Record<string, unknown>).sessionStatus as string | undefined;

        if (cachedStatus === "live") {
          setActiveSessionId(active.id);
          return;
        }

        // If cachedStatus is explicitly "complete", never show the bubble.
        if (cachedStatus === "complete") {
          setActiveSessionId(null);
          return;
        }

        // If no cached status, do a ONE-TIME getDoc to check the session doc.
        // Only show the bubble if the session doc exists AND status === "live".
        // A fresh booking (no session doc) should NOT show the headphone.
        if (!cachedStatus) {
          try {
            const sessSnap = await getDoc(doc(db, "sessions", active.id));
            if (sessSnap.exists()) {
              const sessData = sessSnap.data() as { status?: string };
              if (sessData.status === "live") {
                setActiveSessionId(active.id);
              } else {
                setActiveSessionId(null);
              }
            } else {
              // No session doc = practitioner hasn't started the session yet
              setActiveSessionId(null);
            }
          } catch {
            setActiveSessionId(null);
          }
        } else {
          // cachedStatus is "idle", "none", or any other non-live value
          setActiveSessionId(null);
        }
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
