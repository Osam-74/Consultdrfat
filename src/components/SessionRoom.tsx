"use client";

import { useEffect, useRef, useState } from "react";
import {
  watchSession, watchMessages, ensureSession, startSession, completeSession,
  setNextClient, setOffer, confirmExtension, sendMessage, getSettings,
  createDiscountCode, sendDiscountEmail, setAttachmentsEnabled,
} from "@/lib/db";
import { startVoice, getMicStream, VoiceHandle } from "@/lib/webrtc";
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

  // Attachment (client side)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const msgsRef = useRef<HTMLDivElement>(null);
  const voiceRef = useRef<VoiceHandle | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // ── Firestore subscriptions ──
  useEffect(() => {
    getSettings().then((s) => setPricePerMin(s.priceNGN / s.sessionLengthMin)).catch(() => {});
    ensureSession(bookingId, DEFAULT_SETTINGS.sessionLengthMin).catch(() => {});
    const u1 = watchSession(bookingId, setSession);
    const u2 = watchMessages(bookingId, setMessages);
    return () => { u1(); u2(); };
  }, [bookingId]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  useEffect(() => { msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight }); }, [messages.length]);

  // Grab client info from system messages (populated when booking was created)
  useEffect(() => {
    if (!isPract) return;
    // Look for a system message that carries client metadata (we'll send one on session start)
    const sys = messages.find(m => m.from === "system" && m.text.startsWith("CLIENT_META:"));
    if (sys) {
      try {
        const data = JSON.parse(sys.text.slice("CLIENT_META:".length));
        setClientEmail(data.email ?? "");
        setClientName(data.name ?? "");
        setClientUid(data.uid ?? "");
      } catch { /* ignore */ }
    }
  }, [messages, isPract]);

  // ── Voice ──
  const joinVoice = async () => {
    try {
      const stream = await getMicStream();
      localStreamRef.current = stream;
      setMicOn(true);

      // Start WebRTC FIRST — before any AudioContext work.
      // AudioContext.createMediaStreamSource() can reroute the stream on some
      // browsers (especially mobile Safari/Chrome) and prevent WebRTC from
      // receiving audio. We pass the original stream to startVoice, then
      // meter a separate CLONE so WebRTC is never affected.
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

      // Meter a CLONE — never the stream used by WebRTC
      meter(stream.clone());
    } catch (err) {
      console.error("joinVoice error:", err);
      setMicOn(true); // reflect intent even if no device
    }
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

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    voiceRef.current?.stop();
  }, []);

  // ── Redirect on session complete ──
  useEffect(() => {
    if (!session) return;
    if (session.status !== "complete") return;
    // Stop all media immediately
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    voiceRef.current?.stop().catch(() => {});
    // Give them a moment to see the final state, then redirect
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
      alert("Client info not available yet. Wait for them to join the session.");
      return;
    }
    setDiscountSending(true);
    try {
      const dc = await createDiscountCode({
        percent: discountPct,
        clientEmail,
        clientName,
        clientUid,
        bookingId,
      });
      setDiscountCode(dc.code);
      // Send in-session chat message visible to client
      await sendMessage(bookingId, "system",
        `🎁 You've received a ${discountPct}% discount for your next consultation! Your code: ${dc.code} (valid 90 days)`
      );
      // Queue email
      await sendDiscountEmail({
        toEmail: clientEmail,
        clientName,
        code: dc.code,
        percent: discountPct,
        expiresAt: dc.expiresAt.toDate(),
      });
      setDiscountSent(true);
      setShowDiscount(false);
    } catch (err) {
      console.error("Discount error:", err);
      alert("Failed to generate discount. Please try again.");
    } finally {
      setDiscountSending(false);
    }
  };

  // ── File attachment (client) ──
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("File must be under 10 MB."); return; }
    setUploading(true);
    try {
      // Upload via Firebase Storage or convert to base64 for small files
      // For now we notify via system message that a file was shared (practitioner reviews name)
      await sendMessage(bookingId, role,
        `📎 Shared a file: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`
      );
    } catch (err) {
      console.error("File share error:", err);
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
  const complete = (session.status as string) === "complete" || (session.status === "live" && remaining <= 0);
  const offer = session.offer;
  const priceFor = (min: number) => Math.round(pricePerMin * min);
  const attachmentsOn = session.attachmentsEnabled ?? false;

  const send = () => { const v = draft.trim(); if (!v) return; sendMessage(bookingId, role, v); setDraft(""); };

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
        <div className="brand">
          <div className="brand-icon" style={{width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,var(--teal),var(--sky))",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14}}>🩺</div>
          <span style={{color:"#fff",fontWeight:700,fontSize:16}}>ConsultDrFat</span>
        </div>
        <div className="tag">Live session · {role}</div>
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
                <div className="role">{voiceLive ? "Voice connected" : "In room"}</div>
              </div>
            </div>
            <div className="conn">
              <span className={"led" + (complete ? " off" : "")} />
              {complete ? "Time complete" : "Connected"}
            </div>
          </div>

          {/* ── Voice panel — slightly smaller ── */}
          <div className="voice">
            <div className={"timer num " + timerCls}>{fmt(remaining)}</div>
            <div className="tl">{complete ? "Session time complete" : "Session time remaining"}</div>
            <div className="orb" style={{ transform: `scale(${scale})` }}>{micOn ? "🎙️" : "🎧"}</div>
            <div className="vn">{voiceLive ? "Voice connected" : micOn ? "Mic ready" : "Join voice to talk"}</div>
            <div className="controls">
              {!localStreamRef.current
                ? <button className="ctl" onClick={joinVoice}><span className="knob">🎧</span>Join voice</button>
                : <button className={"ctl" + (micOn ? "" : " muted")} onClick={toggleMute}>
                    <span className="knob">🎙️</span>{micOn ? "Mute" : "Unmute"}
                  </button>}
              <button className="ctl danger" onClick={() => completeSession(bookingId)}>
                <span className="knob">✕</span>{isPract ? "End" : "Leave"}
              </button>
            </div>
          </div>

          {/* ── Chat ── */}
          <div className="chat">
            <div className="msgs" ref={msgsRef}>
              {messages
                .filter(m => !m.text.startsWith("CLIENT_META:")) // hide internal metadata msgs
                .map((m) => {
                  const cls = m.from === "system" ? "system" : m.from === role ? "mine" : "theirs";
                  return (
                    <div key={m.id} className={"msg " + cls}>
                      {m.text}
                      {m.from !== "system" && (
                        <div className="t">{new Date(m.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
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
                placeholder={isPract ? "Message your client…" : "Message…"}
              />
              {/* File attachment button for client (when practitioner enabled it) */}
              {!isPract && attachmentsOn && (
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
              <button onClick={send}>↑</button>
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
              <button className="dbtn primary" onClick={() => {
                startSession(bookingId, session.durationMin);
                // Send client metadata as a hidden system message so discount works
                if (user) {
                  // Practitioner doesn't have client info directly — client sends theirs on join
                }
              }}>Start session</button>
            )}
            {session.status === "live" && (
              <button className="dbtn" onClick={() => completeSession(bookingId)}>End now</button>
            )}

            {/* Discount code button */}
            <button
              className={"dbtn" + (discountSent ? " success" : "")}
              onClick={() => { setShowDiscount(!showDiscount); setDiscountSent(false); }}
              title="Generate a discount code for this client"
            >
              {discountSent ? `✓ ${discountCode} sent` : "🎁 Give discount"}
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

            {/* Attachment toggle */}
            <div
              className={"toggle" + (attachmentsOn ? " on" : "")}
              onClick={() => setAttachmentsEnabled(bookingId, !attachmentsOn)}
              title="Allow client to attach files"
            >
              <span className="sw" /> Client file uploads
            </div>

            <div
              className={"toggle" + (session.nextClientAt ? " on" : "")}
              onClick={() => setNextClient(bookingId, session.nextClientAt ? null : "3:30")}
            >
              <span className="sw" /> Next client at 3:30
            </div>
          </div>
        )}
      </div>
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
              <button className="obtn amber" onClick={() => confirmExtension(bookingId, session)}>Confirm &amp; resume</button>
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
              <button className="obtn red" onClick={() => completeSession(bookingId)}>End session</button>
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
            <button className="obtn ghost" onClick={() => setOffer(bookingId, { ...offer, status: "declined" })}>No thanks</button>
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
