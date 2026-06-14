"use client";

import { useEffect, useRef, useState } from "react";
import {
  watchSession, watchMessages, ensureSession, startSession, completeSession,
  setNextClient, setOffer, confirmExtension, sendMessage, getSettings,
} from "@/lib/db";
import { startVoice, VoiceHandle } from "@/lib/webrtc";
import { payNGN } from "@/lib/paystack";
import { SessionDoc, Message, Role, EXTENSION_MINUTES, DEFAULT_SETTINGS } from "@/lib/types";

const ngn = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);
function fmt(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.round(ms / 1000), m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function SessionRoom({ bookingId, role }: { bookingId: string; role: Role }) {
  const isPract = role === "practitioner";
  const [session, setSession] = useState<SessionDoc | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [now, setNow] = useState(Date.now());
  const [draft, setDraft] = useState("");
  const [chosen, setChosen] = useState<number | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [scale, setScale] = useState(1);
  const [voiceLive, setVoiceLive] = useState(false);
  const [pricePerMin, setPricePerMin] = useState(DEFAULT_SETTINGS.priceNGN / DEFAULT_SETTINGS.sessionLengthMin);

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

  // ── Voice ──
  const joinVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setMicOn(true);
      meter(stream);
      voiceRef.current = await startVoice({
        bookingId, role, localStream: stream,
        onRemote: (remote) => { if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = remote; remoteAudioRef.current.play().catch(() => {}); } },
        onState: (st) => setVoiceLive(st === "connected"),
      });
    } catch {
      setMicOn(true); // reflect intent even if no device/permission
    }
  };
  const meter = (stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser(); an.fftSize = 256; src.connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const frame = () => { an.getByteFrequencyData(data); const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setScale(1 + Math.min(avg / 40, 1) * 0.18); rafRef.current = requestAnimationFrame(frame); };
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

  if (!session) return <div className="room-bg"><div className="center"><p style={{ color: "#fff" }}>Connecting…</p></div></div>;

  const remaining = session.endAt ? session.endAt.toMillis() - now : session.durationMin * 60_000;
  const timerCls = remaining <= 60_000 ? "crit" : remaining <= 5 * 60_000 ? "warn" : "";
  const complete = session.status === "complete" || (session.status === "live" && remaining <= 0);
  const offer = session.offer;
  const priceFor = (min: number) => Math.round(pricePerMin * min);

  const send = () => { const v = draft.trim(); if (!v) return; sendMessage(bookingId, role, v); setDraft(""); };

  const queueWarn = isPract && session.nextClientAt && chosen
    ? `Next client is booked at ${session.nextClientAt}` + (chosen >= 30 ? " — a +30 min extension may overlap." : " — a +15 min extension should still finish in time.")
    : null;

  // client accepts: pay for the extension, then mark accepted (practitioner confirms after)
  const acceptOffer = () => {
    if (!offer) return;
    payNGN({
      email: "", amountNGN: offer.priceNGN, metadata: { bookingId, kind: "extension", minutes: offer.minutes },
      onSuccess: (ref) => setOffer(bookingId, { ...offer, status: "accepted", paystackRef: ref }),
      onCancel: () => {},
    });
  };

  return (
    <div className="room-bg">
      <audio ref={remoteAudioRef} autoPlay playsInline hidden />
      <div className="room-top">
        <div className="brand"><span className="m">M</span>MindBridge</div>
        <div className="tag">Live session · {role}</div>
      </div>

      <div className="stage">
        <h2>Your session</h2>
        <p className="sub">{isPract ? "You are hosting your client." : "Your session with your practitioner."}</p>

        <div className="pane">
          <div className="pane-h">
            <div className="who">
              <div className={"avatar " + (isPract ? "cl" : "dr")}>{isPract ? "CL" : "DR"}</div>
              <div><div className="nm">{isPract ? "Your client" : "Your practitioner"}</div>
                <div className="role">{voiceLive ? "Voice connected" : "In room"}</div></div>
            </div>
            <div className="conn"><span className={"led" + (complete ? " off" : "")} />{complete ? "Time complete" : "Connected"}</div>
          </div>

          <div className="voice">
            <div className={"timer num " + timerCls}>{fmt(remaining)}</div>
            <div className="tl">{complete ? "Session time complete" : "Session time remaining"}</div>
            <div className="orb" style={{ transform: `scale(${scale})` }}>{micOn ? "🎙️" : "🎧"}</div>
            <div className="vn">{voiceLive ? "Voice connected" : micOn ? "Mic ready" : "Join voice to talk"}</div>
            <div className="controls">
              {!localStreamRef.current
                ? <button className="ctl" onClick={joinVoice}><span className="knob">🎧</span>Join voice</button>
                : <button className={"ctl" + (micOn ? "" : " muted")} onClick={toggleMute}><span className="knob">🎙️</span>{micOn ? "Mute" : "Unmute"}</button>}
              <button className="ctl danger" onClick={() => completeSession(bookingId)}><span className="knob">✕</span>{isPract ? "End" : "Leave"}</button>
            </div>
          </div>

          <div className="chat">
            <div className="msgs" ref={msgsRef}>
              {messages.map((m) => {
                const cls = m.from === "system" ? "system" : m.from === role ? "mine" : "theirs";
                return (
                  <div key={m.id} className={"msg " + cls}>
                    {m.text}
                    {m.from !== "system" && <div className="t">{new Date(m.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>}
                  </div>
                );
              })}
            </div>
            <div className="composer">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={isPract ? "Message your client…" : "Message…"} />
              <button onClick={send}>↑</button>
            </div>
          </div>

          {/* overlays */}
          {renderOverlay()}
        </div>

        {isPract && (
          <div className="dock">
            <span className="lbl">Controls</span>
            {session.status !== "live" && <button className="dbtn primary" onClick={() => startSession(bookingId, session.durationMin)}>Start session</button>}
            {session.status === "live" && <button className="dbtn" onClick={() => completeSession(bookingId)}>End now</button>}
            <div className={"toggle" + (session.nextClientAt ? " on" : "")} onClick={() => setNextClient(bookingId, session.nextClientAt ? null : "3:30")}>
              <span className="sw" /> Next client at 3:30
            </div>
          </div>
        )}
      </div>
    </div>
  );

  function renderOverlay() {
    if (!session) return null;
    if (isPract) {
      if (offer?.status === "sent")
        return <div className="overlay"><h3>Offer sent</h3><p>Offered +{offer.minutes} min ({ngn(offer.priceNGN)}). Waiting for the client to accept &amp; pay…</p></div>;
      if (offer?.status === "accepted")
        return <div className="overlay"><h3>Client paid</h3><p>Payment received for +{offer.minutes} min. Confirm to resume.</p>
          <div className="ov-actions"><button className="obtn amber" onClick={() => confirmExtension(bookingId, session)}>Confirm &amp; resume</button></div></div>;
      if (!complete) return null;
      if (chosen === null)
        return <div className="overlay"><h3>Session time complete</h3><p>Close the session, or offer extra paid time.</p>
          <div className="ov-actions"><button className="obtn amber" onClick={() => setChosen(0)}>Offer more time</button>
          <button className="obtn ghost" onClick={() => { completeSession(bookingId); sendMessage(bookingId, "system", "Session closed by the practitioner."); }}>Close session</button></div></div>;
      return (
        <div className="overlay">
          <h3>Offer more time</h3>
          {queueWarn && <div className="qwarn">{queueWarn}</div>}
          <div className="timeopts">
            {EXTENSION_MINUTES.map((m) => (
              <button key={m} className={"timeopt" + (chosen === m ? " sel" : "")} onClick={() => setChosen(m)}>
                <div className="mm num">+{m}</div><div className="pr">{ngn(priceFor(m))}</div>
              </button>
            ))}
          </div>
          <div className="ov-actions">
            <button className="obtn amber" disabled={!chosen} onClick={() => { if (chosen) { setOffer(bookingId, { minutes: chosen, priceNGN: priceFor(chosen), status: "sent" }); setChosen(null); } }}>Send offer to client</button>
            <button className="obtn ghost" onClick={() => setChosen(null)}>Back</button>
          </div>
        </div>
      );
    }
    // client
    if (offer?.status === "sent")
      return <div className="overlay"><h3>+{offer.minutes} minutes offered</h3><p>Your practitioner has offered {offer.minutes} more minutes for {ngn(offer.priceNGN)}. Continue?</p>
        <div className="ov-actions"><button className="obtn amber" onClick={acceptOffer}>Accept &amp; pay</button>
        <button className="obtn ghost" onClick={() => setOffer(bookingId, { ...offer, status: "declined" })}>Not today</button></div></div>;
    if (offer?.status === "accepted")
      return <div className="overlay"><h3>Payment received</h3><p>Waiting for your practitioner to resume the session…</p></div>;
    if (complete)
      return <div className="overlay"><h3>Time complete</h3><p>Thanks for the session. Your practitioner may offer extra time.</p></div>;
    return null;
  }
}
