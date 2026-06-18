"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  watchSession, watchMessages, ensureSession, startSession, completeSession,
  setNextClient, setOffer, confirmExtension, sendMessage, getSettings,
} from "@/lib/db";
import { startVoice, VoiceHandle } from "@/lib/webrtc";
import { useAuth } from "@/lib/auth";
import { payNGN } from "@/lib/paystack";
import { SessionDoc, Message, Role, EXTENSION_MINUTES, DEFAULT_SETTINGS } from "@/lib/types";

const ngn = (n: number) =>
  new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(n);

function fmt(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.round(ms / 1000), m = Math.floor(s / 60);
  return `${String(m).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
}

export default function SessionRoom({ bookingId, role }: { bookingId: string; role: Role }) {
  const isPract = role === "practitioner";
  const { user } = useAuth();
  const [session,     setSession]     = useState<SessionDoc | null>(null);
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [now,         setNow]         = useState(Date.now());
  const [draft,       setDraft]       = useState("");
  const [chosen,      setChosen]      = useState<number | null>(null);
  const [micOn,       setMicOn]       = useState(false);
  const [scale,       setScale]       = useState(1);
  const [voiceLive,   setVoiceLive]   = useState(false);
  const [pricePerMin, setPricePerMin] = useState(DEFAULT_SETTINGS.priceNGN / DEFAULT_SETTINGS.sessionLengthMin);
  const [showLeave,   setShowLeave]   = useState(false); // confirm-leave dialog

  const msgsRef        = useRef<HTMLDivElement>(null);
  const voiceRef       = useRef<VoiceHandle | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef         = useRef<number | null>(null);

  // ── Subscriptions ──────────────────────────────────────────────────────────
  useEffect(() => {
    getSettings().then((s) => setPricePerMin(s.priceNGN / s.sessionLengthMin)).catch(() => {});
    ensureSession(bookingId, DEFAULT_SETTINGS.sessionLengthMin).catch(() => {});
    const u1 = watchSession(bookingId, setSession);
    const u2 = watchMessages(bookingId, setMessages);
    return () => { u1(); u2(); };
  }, [bookingId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight });
  }, [messages.length]);

  // ── Voice ──────────────────────────────────────────────────────────────────
  const joinVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setMicOn(true);
      meter(stream);
      voiceRef.current = await startVoice({
        bookingId, role, localStream: stream,
        onRemote: (remote) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remote;
            remoteAudioRef.current.play().catch(() => {});
          }
        },
        onState: (st) => setVoiceLive(st === "connected"),
      });
    } catch { setMicOn(true); }
  };

  const meter = (stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser(); an.fftSize = 256; src.connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const frame = () => {
        an.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setScale(1 + Math.min(avg / 40, 1) * 0.18);
        rafRef.current = requestAnimationFrame(frame);
      };
      frame();
    } catch {}
  };

  const toggleMute = () => {
    const tr = localStreamRef.current?.getAudioTracks()[0];
    if (tr) { tr.enabled = !tr.enabled; setMicOn(tr.enabled); }
  };

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    voiceRef.current?.stop();
  }, []);

  // ── Connecting screen ──────────────────────────────────────────────────────
  if (!session) return (
    <div className="room-bg">
      <div className="center"><p style={{ color:"#fff" }}>Connecting to session room…</p></div>
    </div>
  );

  const remaining = session.endAt
    ? session.endAt.toMillis() - now
    : session.durationMin * 60_000;
  const timerCls = remaining <= 60_000 ? "crit" : remaining <= 5 * 60_000 ? "warn" : "";
  const complete = session.status === "complete" || (session.status === "live" && remaining <= 0);
  const offer = session.offer;
  const priceFor = (min: number) => Math.round(pricePerMin * min);

  const send = () => {
    const v = draft.trim(); if (!v) return;
    sendMessage(bookingId, role, v); setDraft("");
  };

  const queueWarn = isPract && session.nextClientAt && chosen
    ? `Next client at ${session.nextClientAt}` + (chosen >= 30 ? " — +30 min may overlap." : " — +15 min should be fine.")
    : null;

  const acceptOffer = () => {
    if (!offer) return;
    payNGN({
      email: user?.email ?? "",
      amountNGN: offer.priceNGN,
      metadata: { bookingId, kind: "extension", minutes: offer.minutes },
      onSuccess: (ref) => setOffer(bookingId, { ...offer, status: "accepted", paystackRef: ref }),
      onCancel: () => {},
    });
  };

  // ── Full render ────────────────────────────────────────────────────────────
  return (
    <div className="room-bg">
      <audio ref={remoteAudioRef} autoPlay playsInline hidden />

      {/* ── Top bar ── */}
      <div className="room-top">
        <div className="brand">
          <div className="brand-icon" style={{
            width:30,height:30,borderRadius:8,
            background:"linear-gradient(135deg,var(--teal),var(--sky))",
            display:"flex",alignItems:"center",justifyContent:"center",
            color:"#fff",fontSize:14,
          }}>🩺</div>
          <span style={{ color:"#fff", fontWeight:700, fontSize:16 }}>ConsultDrFat</span>
        </div>

        {/* ── Navigation links in top bar ── */}
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <span className="tag" style={{ marginRight:4 }}>
            {complete ? "Session complete" : "Live session"} · {role}
          </span>
          {isPract ? (
            <Link href="/p-dfta/" style={topNavBtn}>🏠 Dashboard</Link>
          ) : (
            <>
              <Link href="/book/" style={topNavBtn}>📅 My Bookings</Link>
              <Link href="/"      style={topNavBtn}>🏠 Home</Link>
            </>
          )}
        </div>
      </div>

      <div className="stage">
        {/* ── Complete banner (non-overlay) for client ── */}
        {complete && !isPract && (
          <div style={{
            background: "rgba(14,138,122,.15)", border:"1px solid rgba(14,138,122,.3)",
            borderRadius:14, padding:"18px 24px", marginBottom:20,
            display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12,
          }}>
            <div>
              <div style={{ color:"#fff", fontWeight:700, fontSize:16, marginBottom:4 }}>✅ Session complete</div>
              <div style={{ color:"rgba(255,255,255,.65)", fontSize:13.5 }}>Thank you for your consultation with Dr. Fat.</div>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <Link href="/book/" style={{
                background:"rgba(255,255,255,.12)", color:"#fff", borderRadius:10,
                padding:"9px 18px", fontSize:13, fontWeight:700, textDecoration:"none",
              }}>📅 Book Again</Link>
              <Link href="/" style={{
                background:"linear-gradient(135deg,var(--teal),var(--sky))", color:"#fff",
                borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, textDecoration:"none",
              }}>🏠 Return Home</Link>
            </div>
          </div>
        )}

        {/* ── Complete banner for practitioner ── */}
        {complete && isPract && (
          <div style={{
            background:"rgba(14,138,122,.15)", border:"1px solid rgba(14,138,122,.3)",
            borderRadius:14, padding:"18px 24px", marginBottom:20,
            display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12,
          }}>
            <div>
              <div style={{ color:"#fff", fontWeight:700, fontSize:16, marginBottom:4 }}>✅ Session complete</div>
              <div style={{ color:"rgba(255,255,255,.65)", fontSize:13.5 }}>This session has ended. Return to your dashboard.</div>
            </div>
            <Link href="/p-dfta/" style={{
              background:"linear-gradient(135deg,var(--teal),var(--sky))", color:"#fff",
              borderRadius:10, padding:"9px 18px", fontSize:13, fontWeight:700, textDecoration:"none",
            }}>🏠 Back to Dashboard</Link>
          </div>
        )}

        <h2>Your session</h2>
        <p className="sub">{isPract ? "You are hosting your client." : "Your session with Dr. Fat."}</p>

        <div className="pane">
          <div className="pane-h">
            <div className="who">
              <div className={"avatar " + (isPract ? "cl" : "dr")}>{isPract ? "CL" : "DR"}</div>
              <div>
                <div className="nm">{isPract ? "Your client" : "Dr. Fat"}</div>
                <div className="role">{voiceLive ? "🟢 Voice connected" : complete ? "Session ended" : "In room"}</div>
              </div>
            </div>
            <div className="conn">
              <span className={"led" + (complete ? " off" : "")} />
              {complete ? "Session complete" : "Connected"}
            </div>
          </div>

          {/* ── Voice pane ── */}
          <div className="voice">
            <div className={"timer num " + timerCls}>{fmt(remaining)}</div>
            <div className="tl">{complete ? "Session time complete" : "Session time remaining"}</div>
            <div className="orb" style={{ transform:`scale(${scale})` }}>{micOn ? "🎙️" : "🎧"}</div>
            <div className="vn">{voiceLive ? "Voice connected" : micOn ? "Mic ready" : "Join voice to start talking"}</div>
            <div className="controls">
              {!localStreamRef.current
                ? <button className="ctl" onClick={joinVoice}><span className="knob">🎧</span>Join voice</button>
                : <button className={"ctl"+(micOn?"":" muted")} onClick={toggleMute}>
                    <span className="knob">🎙️</span>{micOn ? "Mute" : "Unmute"}
                  </button>
              }
              {!complete && (
                <button className="ctl danger" onClick={() => setShowLeave(true)}>
                  <span className="knob">✕</span>{isPract ? "End session" : "Leave session"}
                </button>
              )}
            </div>
          </div>

          {/* ── Chat ── */}
          <div className="chat">
            <div className="msgs" ref={msgsRef}>
              {messages.map((m) => {
                const cls = m.from === "system" ? "system" : m.from === role ? "mine" : "theirs";
                return (
                  <div key={m.id} className={"msg " + cls}>
                    {m.text}
                    {m.from !== "system" && (
                      <div className="t">
                        {new Date(m.t).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="composer">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={isPract ? "Message your client…" : "Message your practitioner…"}
              />
              <button onClick={send}>↑</button>
            </div>
          </div>

          {/* ── Overlays ── */}
          {renderOverlay()}
        </div>

        {/* ── Practitioner dock ── */}
        {isPract && (
          <div className="dock">
            <span className="lbl">Controls</span>
            {session.status !== "live" && (
              <button className="dbtn primary" onClick={() => startSession(bookingId, session.durationMin)}>
                ▶ Start session
              </button>
            )}
            {session.status === "live" && (
              <button className="dbtn" onClick={() => completeSession(bookingId)}>End now</button>
            )}
            <div
              className={"toggle" + (session.nextClientAt ? " on" : "")}
              onClick={() => setNextClient(bookingId, session.nextClientAt ? null : "next slot")}
            >
              <span className="sw" /> Next client queued
            </div>
          </div>
        )}

        {/* ── Client: bottom nav ── */}
        {!isPract && (
          <div style={{
            display:"flex", gap:12, justifyContent:"center",
            marginTop:20, flexWrap:"wrap",
          }}>
            <Link href="/book/" style={bottomNavBtn("#F0FAF9","var(--teal)")}>
              📅 My Bookings
            </Link>
            <Link href="/" style={bottomNavBtn("#fff","var(--navy)")}>
              🏠 Return Home
            </Link>
          </div>
        )}
      </div>

      {/* ── Leave confirmation dialog ── */}
      {showLeave && (
        <div style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,.7)",
          display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000,
        }}>
          <div style={{
            background:"#fff", borderRadius:18, padding:"32px 28px", maxWidth:340, width:"90%",
            textAlign:"center",
          }}>
            <div style={{ fontSize:40, marginBottom:12 }}>{isPract ? "🔚" : "🚪"}</div>
            <h3 style={{ margin:"0 0 8px", color:"var(--navy)" }}>
              {isPract ? "End this session?" : "Leave this session?"}
            </h3>
            <p style={{ fontSize:13.5, color:"var(--muted)", lineHeight:1.6, margin:"0 0 24px" }}>
              {isPract
                ? "This will end the session for both you and your client."
                : "You can rejoin from your bookings page if the session is still active."}
            </p>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button
                onClick={() => {
                  completeSession(bookingId);
                  sendMessage(bookingId,"system", isPract ? "Session ended by the practitioner." : "Client left the session.");
                  setShowLeave(false);
                }}
                style={{
                  background:"#e53e3e", color:"#fff", border:"none", borderRadius:10,
                  padding:"10px 22px", fontWeight:700, fontSize:14, cursor:"pointer",
                }}
              >
                {isPract ? "Yes, end it" : "Yes, leave"}
              </button>
              <button
                onClick={() => setShowLeave(false)}
                style={{
                  background:"var(--paper)", color:"var(--navy)", border:"1px solid var(--line)",
                  borderRadius:10, padding:"10px 22px", fontWeight:600, fontSize:14, cursor:"pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── Overlay renderer ────────────────────────────────────────────────────────
  function renderOverlay() {
    if (!session) return null;

    if (isPract) {
      if (offer?.status === "sent")
        return (
          <div className="overlay">
            <h3>Offer sent ⏳</h3>
            <p>Offered +{offer.minutes} min ({ngn(offer.priceNGN)}). Waiting for client to pay…</p>
          </div>
        );
      if (offer?.status === "accepted")
        return (
          <div className="overlay">
            <h3>✅ Client paid</h3>
            <p>Payment received for +{offer.minutes} min. Confirm to resume.</p>
            <div className="ov-actions">
              <button className="obtn amber" onClick={() => confirmExtension(bookingId, session)}>
                Confirm &amp; resume
              </button>
            </div>
          </div>
        );
      if (!complete) return null;
      if (chosen === null)
        return (
          <div className="overlay">
            <h3>Session time complete</h3>
            <p>You can offer extra paid time, or close the session.</p>
            <div className="ov-actions">
              <button className="obtn amber" onClick={() => setChosen(0)}>Offer more time</button>
              <button className="obtn ghost" onClick={() => {
                completeSession(bookingId);
                sendMessage(bookingId,"system","Session closed by the practitioner.");
              }}>Close session</button>
            </div>
          </div>
        );
      return (
        <div className="overlay">
          <h3>Offer more time</h3>
          {queueWarn && <div className="qwarn">{queueWarn}</div>}
          <div className="timeopts">
            {EXTENSION_MINUTES.map((m) => (
              <button key={m} className={"timeopt"+(chosen===m?" sel":"")} onClick={() => setChosen(m)}>
                <div className="mm num">+{m}</div>
                <div className="pr">{ngn(priceFor(m))}</div>
              </button>
            ))}
          </div>
          <div className="ov-actions">
            <button className="obtn amber" disabled={!chosen} onClick={() => {
              if (chosen) {
                setOffer(bookingId,{minutes:chosen,priceNGN:priceFor(chosen),status:"sent"});
                setChosen(null);
              }
            }}>Send offer to client</button>
            <button className="obtn ghost" onClick={() => setChosen(null)}>Back</button>
          </div>
        </div>
      );
    }

    // ── Client overlays ──
    if (offer?.status === "sent")
      return (
        <div className="overlay">
          <h3>+{offer.minutes} minutes offered</h3>
          <p>Dr. Fat has offered {offer.minutes} more minutes for {ngn(offer.priceNGN)}.</p>
          <div className="ov-actions">
            <button className="obtn amber" onClick={acceptOffer}>Accept &amp; pay</button>
            <button className="obtn ghost" onClick={() => setOffer(bookingId,{...offer,status:"declined"})}>Decline</button>
          </div>
        </div>
      );
    if (offer?.status === "accepted")
      return (
        <div className="overlay">
          <h3>Payment received ✅</h3>
          <p>Waiting for Dr. Fat to resume the session…</p>
        </div>
      );
    if (complete)
      return (
        <div className="overlay">
          <h3>Session complete 🎉</h3>
          <p>Thank you for your consultation. We hope to see you again.</p>
          <div className="ov-actions">
            <Link href="/book/" className="obtn amber" style={{ textDecoration:"none", display:"block", textAlign:"center" }}>
              📅 Book Another Session
            </Link>
            <Link href="/" className="obtn ghost" style={{ textDecoration:"none", display:"block", textAlign:"center" }}>
              🏠 Return Home
            </Link>
          </div>
        </div>
      );
    return null;
  }
}

// ── Style helpers ─────────────────────────────────────────────────────────────
const topNavBtn: React.CSSProperties = {
  background: "rgba(255,255,255,.12)",
  color: "#fff",
  borderRadius: 8,
  padding: "6px 14px",
  fontSize: 12.5,
  fontWeight: 600,
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,.2)",
  whiteSpace: "nowrap",
};

const bottomNavBtn = (bg: string, color: string): React.CSSProperties => ({
  background: bg,
  color,
  borderRadius: 12,
  padding: "11px 22px",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
  border: "1px solid var(--line)",
});
