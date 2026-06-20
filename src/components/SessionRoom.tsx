"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  watchSession, watchMessages, ensureSession, startSession, completeSession, clearInSession,
  setNextClient, setOffer, confirmExtension, sendMessage, getSettings,
  createDiscountCode, sendDiscountEmail, setAttachmentsEnabled, uploadSessionFile,
  getBookingById, pingPresence, getNextClientBooking,
  clientLeftSession,
  notifyPractitioner,
} from "@/lib/db";
import { API_BASE } from "@/lib/firebase";
import { startVoice, VoiceHandle } from "@/lib/webrtc";
import { useAuth } from "@/lib/auth";
import { payNGN } from "@/lib/paystack";
import { SessionDoc, Message, Role, EXTENSION_MINUTES, DEFAULT_SETTINGS } from "@/lib/types";

const ngn = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);
function fmt(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.round(ms / 1000), m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const DISCOUNT_OPTIONS = [10, 20, 30, 50] as const;

export default function SessionRoom({ bookingId, role }: { bookingId: string; role: Role }) {
  const isPract = role === "practitioner";
  const { user } = useAuth();
  const [session, setSession] = useState<SessionDoc | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [now, setNow] = useState(Date.now());
  const [draft, setDraft] = useState("");
  const [chosen, setChosen] = useState<number | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [scale, setScale] = useState(1);
  const [voiceLive, setVoiceLive] = useState(false);
  const [pricePerMin, setPricePerMin] = useState(DEFAULT_SETTINGS.priceNGN / DEFAULT_SETTINGS.sessionLengthMin);

  // Discount UI state (practitioner only)
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountPct, setDiscountPct] = useState<typeof DISCOUNT_OPTIONS[number]>(20);
  const [discountSending, setDiscountSending] = useState(false);
  const [discountSent, setDiscountSent] = useState(false);
  const [discountCode, setDiscountCode] = useState<string | null>(null);

  // Client info stored in session metadata (sent by system message on session start)
  const [clientEmail, setClientEmail] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientUid, setClientUid] = useState("");

  // Presence — track who is online
  const [otherOnline, setOtherOnline] = useState(false);
  // Real next client time (practitioner only)
  const [nextClientLabel, setNextClientLabel] = useState<string | null>(null);

  // Attachment (client side)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Practitioner file upload refs/state
  const practFileRef = useRef<HTMLInputElement>(null);
  const [practUploading, setPractUploading] = useState(false);

  // Client leave confirmation dialog
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // ── Message reply/tagging ──
  // User can tap any message to quote-reply to it. The quoted message
  // appears above the composer and is sent as a reply reference.
  const [replyTo, setReplyTo] = useState<{ id: string; text: string; from: string } | null>(null);

  // ── Client "Notify" ping button state ──
  // Client can ping the practitioner once every 5 minutes.
  // Button grays out for 3 minutes after pressing, then re-enables.
  const [notifyCooldown, setNotifyCooldown] = useState(false); // true = grayed out
  const [notifyDisabled, setNotifyDisabled] = useState(false); // true = fully disabled (first 3 min)
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyReEnableRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const msgsRef = useRef<HTMLDivElement>(null);
  const voiceRef = useRef<VoiceHandle | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // ── Firestore subscriptions ──
  useEffect(() => {
    getSettings().then((s) => setPricePerMin(s.priceNGN / s.sessionLengthMin)).catch(() => {});
    // ensureSession is called once per booking load.
    // We use getSettings() to get the real duration; fall back to DEFAULT only if fetch fails.
    getSettings()
      .then((s) => ensureSession(bookingId, s.sessionLengthMin))
      .catch(() => ensureSession(bookingId, DEFAULT_SETTINGS.sessionLengthMin));
    const u1 = watchSession(bookingId, setSession);
    const u2 = watchMessages(bookingId, setMessages);
    return () => { u1(); u2(); };
  }, [bookingId]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // ── Presence heartbeat — ping every 10s regardless of session state ──
  // Presence heartbeat — stop pinging when session is complete (saves quota).
  // 60s interval = 1 write/min per user instead of 2/min. Threshold is 120s.
  useEffect(() => {
    if (!user) return;
    if (session?.status === "complete") return; // stop pinging after session ends
    const uid = user.uid;
    pingPresence(bookingId, uid);
    const interval = setInterval(() => pingPresence(bookingId, uid), 90_000);
    return () => clearInterval(interval);
  }, [bookingId, user, session?.status]);

  // Watch presence — re-check every 15s AND whenever session doc changes
  useEffect(() => {
    const check = () => {
      if (!session || !user) return;
      const presence = (session as unknown as Record<string, unknown>).presence as Record<string, number> | undefined;
      if (!presence) return;
      const nowMs = Date.now();
      const THRESHOLD = 120_000; // 120s — allows up to 3 missed 30s pings
      const otherSeen = Object.entries(presence)
        .filter(([uid]) => uid !== user.uid)
        .some(([, lastSeen]) => nowMs - (lastSeen as number) < THRESHOLD);
      setOtherOnline(otherSeen);
    };
    check();
    const interval = setInterval(check, 15_000);
    return () => clearInterval(interval);
  }, [session, user]);
  useEffect(() => { msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight }); }, [messages.length]);

  // Load client info directly from the booking document (already stored at payment time)
  // Also compute next client label for the dock
  useEffect(() => {
    if (!isPract) return;
    getBookingById(bookingId).then((b) => {
      if (!b) return;
      setClientEmail(b.clientEmail ?? "");
      setClientName(b.clientName ?? "");
      setClientUid(b.clientId ?? "");
    }).catch(() => {});

    // One-time fetch — narrow query (max 20 docs in 8h window) instead of scanning ALL paid bookings.
    // This saves a massive amount of Firestore reads.
    getBookingById(bookingId).then(async (bk) => {
      if (!bk) return;
      try {
        const currentMs = bk.slotStart.toMillis();
        const next = await getNextClientBooking(bookingId, currentMs);
        if (next) {
          const label = new Date(next.slotStart.toMillis()).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
          setNextClientLabel(label);
          setNextClient(bookingId, label);
        }
      } catch { /* non-fatal */ }
    }).catch(() => {});
    return () => {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, isPract]);

  // ── Practitioner file upload handler ──
  const handlePractFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX = 20 * 1024 * 1024;
    if (file.size > MAX) { alert("File must be under 20 MB."); return; }
    setPractUploading(true);
    try {
      const uploaded = await uploadSessionFile(bookingId, file, API_BASE);
      const isImage = file.type.startsWith("image/");
      const label = isImage ? `🖼️ ${file.name}` : `📎 ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
      await sendMessage(bookingId, role, label, uploaded);
    } catch (err) {
      console.error("Practitioner file share error:", err);
      const msg = err instanceof Error ? err.message : "Upload failed";
      alert(`Could not share file: ${msg}`);
    } finally {
      setPractUploading(false);
      if (practFileRef.current) practFileRef.current.value = "";
    }
  };

  // ── Client "Notify" ping handler ──
  const handleNotify = async () => {
    if (notifyDisabled || notifyCooldown) return;
    setNotifyDisabled(true);
    setNotifyCooldown(true);
    try {
      await notifyPractitioner(bookingId);
    } catch (err) {
      console.error("Notify error:", err);
    }
    // Re-enable the button after 3 minutes (gray → active)
    notifyReEnableRef.current = setTimeout(() => {
      setNotifyDisabled(false);
    }, 3 * 60 * 1000);
    // Full cooldown is 5 minutes — after 5 min the client can press again
    notifyTimerRef.current = setTimeout(() => {
      setNotifyCooldown(false);
    }, 5 * 60 * 1000);
  };

  // Cleanup notify timers on unmount
  useEffect(() => () => {
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    if (notifyReEnableRef.current) clearTimeout(notifyReEnableRef.current);
  }, []);

  // ── Voice ──
  const joinVoice = async () => {
    try {
      // Request mic with echo cancellation & noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000,
        }
      });
      localStreamRef.current = stream;
      setMicOn(true);
      const voice = await startVoice({
        bookingId, role,
        localStream: stream,
        onRemote: (remoteStream) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(() => {});
          }
        },
      });
      voiceRef.current = voice;
      setVoiceLive(true);
    } catch (err) {
      console.error("Mic/voice error:", err);
      alert("Could not access microphone. Please allow mic access and try again.");
    }
  };;

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
    } catch { /* non-fatal */ }
  };

  const toggleMute = () => {
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    if (tracks.length === 0) return;
    const track = tracks[0];
    const newEnabled = !track.enabled;
    track.enabled = newEnabled;
    setMicOn(newEnabled);
    // The RTCRtpSender holds a reference to the same MediaStreamTrack object,
    // so changing track.enabled above is sufficient — no need to touch senders.
  };

  // ── Full media teardown on unmount ───────────────────────────────────
  useEffect(() => () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    localStreamRef.current?.getTracks().forEach((tr) => { try { tr.stop(); } catch {} });
    localStreamRef.current = null;
    voiceRef.current?.stop().catch(() => {});
    voiceRef.current = null;
    if (remoteAudioRef.current) {
      try { remoteAudioRef.current.pause(); } catch {}
      try { remoteAudioRef.current.srcObject = null; } catch {}
    }
  }, []);

  // ── Auto-join voice the moment session goes live ──────────────────────
  // This fires for BOTH sides: practitioner (who just pressed Start)
  // and client (who is waiting and sees the status flip to "live").
  const hasAutoJoinedRef = useRef(false);
  useEffect(() => {
    if (!session) return;
    if (session.status !== "live") return;
    if (hasAutoJoinedRef.current) return;
    if (localStreamRef.current) return; // already in voice
    hasAutoJoinedRef.current = true;
    joinVoice();
  // joinVoice is stable (no deps change); session.status is what triggers this
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status]);

  // ── Voice keepalive — check connection health every 30s ──
  // If the peer connection has dropped (failed/disconnected for >15s),
  // we tear down and re-join voice automatically. This handles mobile
  // network switches, carrier timeouts, and WiFi changes.
  const voiceKeepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceDownSinceRef = useRef<number | null>(null);
  useEffect(() => {
    if (session?.status !== "live") return;
    if (!voiceRef.current) return;
    voiceKeepaliveRef.current = setInterval(() => {
      const pc = voiceRef.current?.pc;
      if (!pc) return;
      const state = pc.connectionState;
      if (state === "failed" || state === "disconnected" || state === "closed") {
        if (voiceDownSinceRef.current === null) {
          voiceDownSinceRef.current = Date.now();
        }
        // If down for >15s, attempt reconnection
        if (voiceDownSinceRef.current && Date.now() - voiceDownSinceRef.current > 15_000) {
          console.warn("[Voice] Connection down >15s — reconnecting...");
          voiceDownSinceRef.current = null;
          // Tear down existing voice
          voiceRef.current?.stop().catch(() => {});
          voiceRef.current = null;
          localStreamRef.current?.getTracks().forEach((tr) => { try { tr.stop(); } catch {} });
          localStreamRef.current = null;
          setVoiceLive(false);
          setMicOn(false);
          // Re-join after a brief delay
          setTimeout(() => {
            if (hasAutoJoinedRef.current) {
              joinVoice();
            }
          }, 2000);
        }
      } else if (state === "connected") {
        voiceDownSinceRef.current = null;
      }
    }, 30_000);
    return () => {
      if (voiceKeepaliveRef.current) clearInterval(voiceKeepaliveRef.current);
      voiceKeepaliveRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status]);

  // ── Teardown + redirect on session complete ──────────────────────────
  useEffect(() => {
    if (!session) return;
    if (session.status !== "complete") return;

    // ── Kill ALL audio/voice immediately ──
    // 1. Cancel animation frame (mic meter)
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

    // 2. Stop every local media track
    localStreamRef.current?.getTracks().forEach((tr) => { try { tr.stop(); } catch {} });
    localStreamRef.current = null;

    // 3. Stop WebRTC peer connection (closes ICE transport + remote track)
    voiceRef.current?.stop().catch(() => {});
    voiceRef.current = null;

    // 4. Kill the remote audio element — detach srcObject and pause
    if (remoteAudioRef.current) {
      try { remoteAudioRef.current.pause(); } catch {}
      try { remoteAudioRef.current.srcObject = null; } catch {}
    }

    // 5. Update UI state
    setVoiceLive(false);
    setMicOn(false);

    // Clear inSession flag so waiting room removes this client immediately
    if (!isPract) {
      clearInSession(bookingId).catch(() => {});
    }

    // Redirect after a brief "session complete" screen
    const timer = setTimeout(() => {
      if (isPract) {
        window.location.href = "/p-dfta";
      } else {
        window.location.href = "/";
      }
    }, 3500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status]);

  // ── Discount code generation (practitioner) ──
  const sendDiscount = async () => {
    if (!clientEmail || !clientUid || !clientName) {
      alert("Client info not available yet. Wait a moment for the client to connect.");
      return;
    }
    setDiscountSending(true);
    try {
      // 1. Create the discount code in Firestore (fast — single write)
      const dc = await createDiscountCode({
        percent: discountPct,
        clientEmail,
        clientName,
        clientUid,
        bookingId,
      });
      setDiscountCode(dc.code);

      // 2. Send in-session chat message so client sees code immediately
      await sendMessage(bookingId, "system",
        `🎁 You've received a ${discountPct}% discount! Code: ${dc.code} (valid 90 days — use it on your next booking).`
      );

      // 3. Fire-and-forget the email — don't await it (avoids blocking on mail extension)
      sendDiscountEmail({
        toEmail: clientEmail,
        clientName,
        code: dc.code,
        percent: discountPct,
        expiresAt: dc.expiresAt.toDate(),
      }).catch((e) => console.warn("Discount email queue failed (non-fatal):", e));

      setDiscountSent(true);
      setShowDiscount(false);
    } catch (err) {
      console.error("Discount error:", err);
      alert("Failed to generate discount. Please try again.");
    } finally {
      setDiscountSending(false);
    }
  };

  // ── File attachment — uploaded to Cloudflare R2 via Worker ──
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX = 20 * 1024 * 1024; // 20 MB cap
    if (file.size > MAX) { alert("File must be under 20 MB."); return; }
    setUploading(true);
    try {
      const uploaded = await uploadSessionFile(bookingId, file, API_BASE);
      const isImage = file.type.startsWith("image/");
      const label = isImage
        ? `🖼️ ${file.name}`
        : `📎 ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
      await sendMessage(bookingId, role, label, uploaded);
    } catch (err) {
      console.error("File share error:", err);
      const msg = err instanceof Error ? err.message : "Upload failed";
      alert(`Could not share file: ${msg}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!session) return <div className="room-bg"><div className="center"><p style={{ color: "#fff" }}>Connecting…</p></div></div>;

  // Show redirect screen when complete
  if (session.status === "complete") {
    return (
      <div className="room-bg" style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 52 }}>✅</div>
        <h2 style={{ color: "#fff", margin: 0 }}>Session complete</h2>
        <p style={{ color: "rgba(255,255,255,.6)", margin: 0, fontSize: 15 }}>
          {isPract ? "Returning to your dashboard…" : "Returning to home…"}
        </p>
        <div style={{ width: 200, height: 4, background: "rgba(255,255,255,.15)", borderRadius: 99, overflow: "hidden", marginTop: 8 }}>
          <div style={{ height: "100%", background: "var(--teal)", borderRadius: 99, animation: "fillBar 3.2s linear forwards" }} />
        </div>
      </div>
    );
  }

  const remaining = session.endAt ? session.endAt.toMillis() - now : session.durationMin * 60_000;
  const timerCls = remaining <= 60_000 ? "crit" : remaining <= 5 * 60_000 ? "warn" : "";
  const statusStr = session.status as string;
  const complete = statusStr === "complete" || (session.status === "live" && remaining <= 0);
  const offer = session.offer;
  const priceFor = (min: number) => Math.round(pricePerMin * min);
  const attachmentsOn = session.attachmentsEnabled ?? false;

  const sessionLive = session?.status === "live";
  const sessionComplete = (session?.status as string) === "complete";
  const send = () => {
    if (!sessionLive) return;
    const v = draft.trim(); if (!v) return;
    sendMessage(bookingId, role, v, undefined, replyTo ?? undefined);
    setDraft("");
    setReplyTo(null);
  };

  const queueWarn = isPract && session.nextClientAt && chosen
    ? `Next client is booked at ${session.nextClientAt}` + (chosen >= 30 ? " — a +30 min extension may overlap." : " — a +15 min extension should still finish in time.")
    : null;

  const acceptOffer = () => {
    if (!offer) return;
    payNGN({
      email: user?.email ?? "", amountNGN: offer.priceNGN, metadata: { bookingId, kind: "extension", minutes: offer.minutes },
      onSuccess: (ref) => setOffer(bookingId, { ...offer, status: "accepted", paystackRef: ref }),
      onCancel: () => {},
    });
  };

  return (
    <div className="room-bg">
      <audio ref={remoteAudioRef} autoPlay playsInline hidden />
      <div className="room-top">
        {/* Logo → home */}
        <Link href="/" style={{display:"flex",alignItems:"center",gap:8,textDecoration:"none"}}>
          <div className="brand-icon" style={{width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,var(--teal),var(--sky))",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14}}>🩺</div>
          <span style={{color:"#fff",fontWeight:700,fontSize:15}}>ConsultDrFat</span>
        </Link>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {/* Slim live badge */}
          <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,.1)",borderRadius:20,padding:"4px 10px",border:"1px solid rgba(255,255,255,.18)"}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:"#4ade80",display:"inline-block",boxShadow:"0 0 0 2px rgba(74,222,128,.3)",animation:"pulse 1.5s infinite"}} />
            <span style={{color:"rgba(255,255,255,.85)",fontSize:11,fontWeight:600,textTransform:"capitalize"}}>{isPract ? "Practitioner" : "Client"}</span>
          </div>
          {/* Presence indicator */}
          <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:otherOnline?"#4ade80":"rgba(255,255,255,.4)"}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:otherOnline?"#4ade80":"rgba(255,255,255,.25)",display:"inline-block"}} />
            {isPract ? "Client" : "Dr. Fat"} {otherOnline ? "online" : "offline"}
          </div>
        </div>
      </div>

      <div className="stage">
        <h2>Your session</h2>
        <p className="sub">{isPract ? "You are hosting your client." : "Your session with your practitioner."}</p>

        <div className="pane">
          <div className="pane-h">
            <div className="who">
              <div className={"avatar " + (isPract ? "cl" : "dr")}>{isPract ? "CL" : "DR"}</div>
              <div>
                <div className="nm">{isPract ? "Your client" : "Your practitioner"}</div>
                <div className="role" style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{width:6,height:6,borderRadius:"50%",background:otherOnline?"#4ade80":"#94a3b8",display:"inline-block",flexShrink:0}} />
                  {otherOnline ? (voiceLive ? "Online · Voice connected" : "Online") : "Offline"}
                </div>
              </div>
            </div>
            <div className="conn" style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <span className={"led" + (complete ? " off" : "")} />
                {complete ? "Time complete" : "Connected"}
              </div>
              {/* Mic feed visualizer — shows when your mic is transmitting */}
              {micOn && localStreamRef.current && (
                <div style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:"rgba(255,255,255,.55)"}}>
                  <div style={{display:"flex",alignItems:"flex-end",gap:1.5,height:12}}>
                    {[0.4,0.7,1,0.6,0.85].map((h,i) => (
                      <div key={i} style={{
                        width:3,height:`${h*scale*12}px`,borderRadius:2,
                        background:`rgba(74,222,128,${0.5+h*0.5})`,
                        transition:"height .1s",minHeight:2
                      }} />
                    ))}
                  </div>
                  <span>Mic live</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Voice panel — slightly smaller ── */}
          <div className="voice">
            <div className={"timer num " + timerCls}>{fmt(remaining)}</div>
            <div className="tl">{complete ? "Session time complete" : "Session time remaining"}</div>
            <div className="orb" style={{ transform: `scale(${scale})` }}>{micOn ? "🎙️" : "🎧"}</div>
            {!sessionLive && (
              <div className="session-not-started-banner">
                {isPract ? "⏸ Press Start session below to begin" : "⏳ Waiting for practitioner to start the session…"}
              </div>
            )}
            {/* ── Client "Notify" button — ping the practitioner ── */}
            {!isPract && !sessionLive && (
              <button
                onClick={handleNotify}
                disabled={notifyDisabled}
                style={{
                  marginTop: 12,
                  padding: "8px 20px",
                  borderRadius: 10,
                  border: "none",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: notifyDisabled ? "not-allowed" : "pointer",
                  background: notifyDisabled
                    ? "rgba(255,255,255,.08)"
                    : "linear-gradient(135deg,#0E8A7A,#0B2B4A)",
                  color: notifyDisabled ? "rgba(255,255,255,.3)" : "#fff",
                  transition: "all .2s",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                🔔 Notify
              </button>
            )}
            <div className="vn">{voiceLive ? "Voice connected" : micOn ? "Mic ready" : sessionLive ? "Join voice to talk" : "Voice locked"}</div>
            <div className="controls">
              {!localStreamRef.current
                ? <button className="ctl" onClick={joinVoice}
                    disabled={!sessionLive}
                    style={sessionLive ? {} : {opacity:.45, cursor:"not-allowed"}}
                    title={sessionLive ? "Click to join voice" : "Waiting for session to start…"}>
                    <span className="knob">🎧</span>{sessionLive ? "🔴 Join Voice" : "Waiting…"}
                  </button>
                : <button className={"ctl" + (micOn ? "" : " muted")} onClick={toggleMute}>
                    <span className="knob">🎙️</span>{micOn ? "Mute" : "Unmute"}
                  </button>}
              <button className="ctl danger"
                onClick={() => {
                  if (isPract) {
                    completeSession(bookingId);
                  } else {
                    setShowLeaveConfirm(true);
                  }
                }}
                disabled={!sessionLive && !isPract}
              >
                <span className="knob">✕</span>{isPract ? "End" : "Leave"}
              </button>
            </div>
          </div>

          {/* ── Chat ── */}
          <div className="chat">
            <div className="msgs" ref={msgsRef}>
              {messages
                .filter(m => !m.text.startsWith("CLIENT_META:"))
                .map((m) => {
                  const cls = m.from === "system" ? "system" : m.from === role ? "mine" : "theirs";
                  const isImage = m.fileUrl && m.fileType?.startsWith("image/");
                  const isDoc   = m.fileUrl && !isImage;
                  const canReply = m.from !== "system" && sessionLive;
                  return (
                    <div
                      key={m.id}
                      className={"msg " + cls}
                      onClick={() => canReply && setReplyTo({ id: m.id, text: m.text, from: m.from })}
                      style={canReply ? { cursor: "pointer" } : {}}
                      title={canReply ? "Tap to reply" : undefined}
                    >
                      {/* Reply quote — shows the original message being replied to */}
                      {m.replyToText && (
                        <div className="msg-reply-quote" style={{
                          borderLeft: "2px solid rgba(255,255,255,.3)",
                          paddingLeft: 8, marginBottom: 4,
                          fontSize: 11.5, opacity: 0.65,
                          whiteSpace: "pre-wrap", wordBreak: "break-word",
                          fontStyle: "italic",
                        }}>
                          <span style={{ fontWeight: 600 }}>
                            {m.replyToFrom === role ? "You" : m.replyToFrom === "practitioner" ? "Dr. Fat" : "Client"}:
                          </span>{" "}
                          {m.replyToText}
                        </div>
                      )}
                      {/* Inline image preview — full res from R2 CDN */}
                      {isImage && (
                        <div className="msg-attachment">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={m.fileUrl}
                            alt={m.fileName ?? "shared image"}
                            className="msg-img"
                            onClick={(e) => { e.stopPropagation(); window.open(m.fileUrl, "_blank"); }}
                          />
                          <a
                            className="msg-dl-link"
                            href={m.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={m.fileName ?? "image"}
                            onClick={(e) => e.stopPropagation()}
                          >
                            ⬇ Download {m.fileName}
                          </a>
                        </div>
                      )}
                      {/* Document download link */}
                      {isDoc && (
                        <div className="msg-attachment">
                          <a
                            className="msg-dl-link"
                            href={m.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={m.fileName ?? "file"}
                            onClick={(e) => e.stopPropagation()}
                          >
                            📄 {m.fileName} ({m.fileSize ? (m.fileSize/1024).toFixed(0)+"KB" : ""}) ⬇
                          </a>
                        </div>
                      )}
                      {/* Text label — pre-wrap for proper word wrapping */}
                      {(!isImage && !isDoc) && <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</span>}
                      {(isImage || isDoc) && (
                        <span style={{fontSize:11,opacity:.6,display:"block",marginTop:3,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
                          {m.text.replace(/^[🖼️📎]+\s*/,"")}
                        </span>
                      )}
                      {m.from !== "system" && (
                        <div className="t">{new Date(m.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                      )}
                    </div>
                  );
                })}
            </div>
            {/* Reply preview bar — shows above composer when replying */}
            {replyTo && (
              <div className="reply-bar" style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 14px", background: "rgba(0,0,0,.04)",
                borderTop: "1px solid var(--line)", fontSize: 12,
              }}>
                <span style={{ color: "var(--muted)", flexShrink: 0 }}>↩ Replying to</span>
                <span style={{
                  flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap", color: "var(--ink)", fontStyle: "italic",
                }}>
                  {replyTo.from === role ? "You" : replyTo.from === "practitioner" ? "Dr. Fat" : "Client"}: {replyTo.text}
                </span>
                <button
                  onClick={() => setReplyTo(null)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--muted)", fontSize: 16, padding: 0, flexShrink: 0,
                  }}
                  title="Cancel reply"
                >×</button>
              </div>
            )}
            {/* ── Composer — pinned to bottom, textarea for word wrapping ── */}
            <div className="composer">
              <textarea
                value={draft}
                onChange={(e) => sessionLive && setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={sessionLive
                  ? (isPract ? "Message your client…" : "Message…")
                  : (isPract ? "Start the session to enable chat…" : "Waiting for practitioner to start…")}
                disabled={!sessionLive}
                style={{
                  ...(!sessionLive ? {opacity:.45, cursor:"not-allowed"} : {}),
                  resize: "none",
                  minHeight: 40,
                  maxHeight: 100,
                  lineHeight: "1.4",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  overflowY: "auto",
                  flexGrow: 1,
                }}
                rows={1}
              />
              {/* File attachment button for client — only visible when practitioner enables it */}
              {!isPract && sessionLive && !attachmentsOn && (
                <span style={{fontSize:11,color:"rgba(255,255,255,.35)",padding:"0 4px",alignSelf:"center"}}>📎 off</span>
              )}
              {!isPract && attachmentsOn && sessionLive && (
                <>
                  <button
                    className="ctl"
                    style={{ padding: "6px 10px", borderRadius: 8, fontSize: 16, marginLeft: 4 }}
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach file or image"
                    disabled={uploading}
                  >
                    {uploading ? "…" : "📎"}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx"
                    style={{ display: "none" }}
                    onChange={handleFile}
                  />
                </>
              )}
              <button onClick={send} disabled={!sessionLive} style={!sessionLive ? {opacity:.45} : {}}>↑</button>
            </div>
          </div>

          {/* Overlays */}
          {renderOverlay()}
        </div>

        {/* ── Practitioner dock ── */}
        {isPract && (
          <div className="dock">
            <span className="lbl">Controls</span>
            {session.status !== "live" && (
              <button className="dbtn primary" onClick={() => startSession(bookingId, session.durationMin)}>
                Start session
              </button>
            )}
            {session.status === "live" && (
              <button className="dbtn" onClick={async () => {
                try {
                  await completeSession(bookingId);
                } catch (err) {
                  console.error("End session error:", err);
                  alert("Could not end session. Check your connection and try again.");
                }
              }}>End now</button>
            )}

            {/* Gift icon only — no text, tooltip explains */}
            <button
              className={"dbtn icon-only" + (discountSent ? " success" : "")}
              onClick={() => { setShowDiscount(!showDiscount); setDiscountSent(false); }}
              title={discountSent ? `Discount sent: ${discountCode}` : "Give client a discount code"}
            >
              {discountSent ? "✓" : "🎁"}
            </button>

            {/* Discount picker panel */}
            {showDiscount && (
              <div className="discount-panel">
                <div className="dp-title">Discount for client</div>
                <div className="dp-row">
                  {DISCOUNT_OPTIONS.map(p => (
                    <button
                      key={p}
                      className={"dp-pct" + (discountPct === p ? " active" : "")}
                      onClick={() => setDiscountPct(p)}
                    >{p}%</button>
                  ))}
                </div>
                <button
                  className="dbtn primary"
                  style={{ width: "100%", marginTop: 8 }}
                  onClick={sendDiscount}
                  disabled={discountSending}
                >
                  {discountSending ? "Sending…" : `Send ${discountPct}% discount`}
                </button>
                {!clientEmail && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 6, textAlign: "center" }}>
                    Waiting for client session data…
                  </div>
                )}
              </div>
            )}

            {/* Practitioner file share button */}
            {sessionLive && (
              <>
                <button
                  className="dbtn"
                  style={{ marginTop: 4 }}
                  onClick={() => practFileRef.current?.click()}
                  disabled={practUploading}
                  title="Share a file or image with your client"
                >
                  {practUploading ? "Uploading…" : "📎 Share file"}
                </button>
                <input
                  ref={practFileRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx"
                  style={{ display: "none" }}
                  onChange={handlePractFile}
                />
              </>
            )}

            {/* File sharing toggle — icon + toggle only, no text label.
                When ON: client can attach files. When OFF: client upload button is hidden. */}
            <div
              className={"toggle icon-toggle" + (attachmentsOn ? " on" : "")}
              onClick={() => setAttachmentsEnabled(bookingId, !attachmentsOn)}
              title={attachmentsOn ? "Client file sharing ON — click to disable" : "Client file sharing OFF — click to enable"}
            >
              📎 <span className="sw" />
            </div>

            {/* Next client — live from Firestore bookings */}
            {nextClientLabel && (
              <div className="dock-next-client" title="Your next scheduled client">
                ⏭ Next at {nextClientLabel}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Client leave confirmation ── */}
      {showLeaveConfirm && !isPract && (
        <div className="overlay" style={{ zIndex: 100 }}>
          <div className="ov-icon">🚪</div>
          <h3>Leave session?</h3>
          <p>Are you sure you want to leave? The practitioner will be notified.</p>
          <div className="ov-actions">
            <button className="obtn ghost" onClick={() => setShowLeaveConfirm(false)}>
              Stay in session
            </button>
            <button className="obtn red" onClick={async () => {
              setShowLeaveConfirm(false);
              await clientLeftSession(bookingId).catch(() => {});
              voiceRef.current?.stop().catch(() => {});
              voiceRef.current = null;
              localStreamRef.current?.getTracks().forEach((tr) => { try { tr.stop(); } catch {} });
              localStreamRef.current = null;
              window.location.href = "/";
            }}>
              Yes, leave session
            </button>
          </div>
        </div>
      )}
    </div>
  );

  function renderOverlay() {
    if (!session) return null;

    // ── Practitioner overlays ──
    if (isPract) {
      // Extension offer states
      if (offer?.status === "sent") {
        return (
          <div className="overlay">
            <div className="ov-icon">⏳</div>
            <h3>Extension offer sent</h3>
            <p>Offered +{offer.minutes} min ({ngn(offer.priceNGN)}). Waiting for the client to accept and pay…</p>
          </div>
        );
      }
      if (offer?.status === "accepted") {
        return (
          <div className="overlay">
            <div className="ov-icon">✅</div>
            <h3>Payment confirmed</h3>
            <p>Client has paid for +{offer.minutes} min. Tap below to resume the session.</p>
            <div className="ov-actions">
              <button className="obtn amber" onClick={() => {
                confirmExtension(bookingId, session);
                setChosen(null); // reset so next time-out shows "Time's up" instead of auto-offering
              }}>Confirm &amp; resume</button>
            </div>
          </div>
        );
      }
      // Timer ran out
      if (!complete) return null;
      if (chosen === null) {
        return (
          <div className="overlay">
            <div className="ov-icon">⌛</div>
            <h3>Time&apos;s up</h3>
            <p>The session time has elapsed. You can end the session or offer the client extra paid time.</p>
            <div className="ov-actions">
              <button className="obtn amber" onClick={() => setChosen(0)}>+ Offer more time</button>
              <button className="obtn red" onClick={async () => {
                try { await completeSession(bookingId); }
                catch (err) { console.error(err); alert("Could not end session — check connection and try again."); }
              }}>End session</button>
              {/* Reset chosen so the overlay doesn't reappear incorrectly */}
            </div>
          </div>
        );
      }
      if (chosen === 0) {
        return (
          <div className="overlay">
            <div className="ov-icon">⏱</div>
            <h3>How much extra time?</h3>
            {queueWarn && <p className="warn-txt" style={{ color: "#F5D08A", fontSize: 13, marginBottom: 12 }}>{queueWarn}</p>}
            <div className="ov-actions">
              {EXTENSION_MINUTES.map(m => (
                <button
                  key={m}
                  className="obtn amber"
                  onClick={() => {
                    setChosen(m);
                    setOffer(bookingId, { minutes: m, priceNGN: priceFor(m), status: "sent" });
                  }}
                >
                  +{m} min &middot; {ngn(priceFor(m))}
                </button>
              ))}
            </div>
            <button className="obtn ghost" style={{ marginTop: 10 }} onClick={() => completeSession(bookingId)}>
              No, end session
            </button>
          </div>
        );
      }
      return (
        <div className="overlay">
          <div className="ov-icon">💬</div>
          <h3>Extension offered</h3>
          <p>Waiting for your client to accept +{chosen} min…</p>
        </div>
      );
    }

    // ── Client overlays ──
    if (offer?.status === "sent") {
      return (
        <div className="overlay">
          <div className="ov-icon">⏰</div>
          <h3>Extra time available</h3>
          <p>Your practitioner is offering an additional {offer.minutes} minutes for {ngn(offer.priceNGN)}. Would you like to continue?</p>
          <div className="ov-actions">
            <button className="obtn amber" onClick={acceptOffer}>Accept &amp; pay</button>
            <button className="obtn ghost" onClick={() => { setOffer(bookingId, { ...offer, status: "declined" }); }}>No thanks</button>
          </div>
        </div>
      );
    }
    if (offer?.status === "accepted") {
      return (
        <div className="overlay">
          <div className="ov-icon">✅</div>
          <h3>Payment received</h3>
          <p>Waiting for your practitioner to confirm the extension…</p>
        </div>
      );
    }
    return null;
  }
}
