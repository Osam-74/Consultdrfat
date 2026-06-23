"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  watchSession, watchMessages, ensureSession, startSession, completeSession, clearInSession,
  setNextClient, setOffer, confirmExtension, sendMessage, getSettings,
  createDiscountCode, sendDiscountEmail, setAttachmentsEnabled, uploadSessionFile,
  getBookingById, pingPresence, getNextClientBooking,
  clientLeftSession, clientRejoinedSession,
  notifyPractitioner,
  requestExtension, clearExtRequest,
  watchClientNotes, addClientNote,
} from "@/lib/db";
import type { ClientNote } from "@/lib/db";
import { API_BASE } from "@/lib/firebase";
import {
  startVoice, VoiceHandle,
  initiateCall, answerCall, declineCall, endCall,
  watchCallState, getMicStream,
  type CallStatus,
} from "@/lib/webrtc";
import { useAuth } from "@/lib/auth";
import { payNGN } from "@/lib/paystack";
import { SessionDoc, Message, Role, DEFAULT_SETTINGS } from "@/lib/types";

const ngn = (n: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);
function fmt(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.round(ms / 1000), m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const DISCOUNT_OPTIONS = [25, 50, 75, 100] as const;

export default function SessionRoom({ bookingId, role }: { bookingId: string; role: Role }) {
  const isPract = role === "practitioner";
  const { user } = useAuth();
  const [session, setSession] = useState<SessionDoc | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [now, setNow] = useState(Date.now());
  const [draft, setDraft] = useState("");
  const [chosen, setChosen] = useState<number | null>(null);
  const [showExtendNow, setShowExtendNow] = useState(false); // extend during live session
  // Practitioner custom extension offer form
  const [extMinutes, setExtMinutes] = useState(15);
  const [extAmount, setExtAmount] = useState(0);
  const [extIsFree, setExtIsFree] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [scale, setScale] = useState(1);
  const [voiceLive, setVoiceLive] = useState(false);
  // ── Call state (new call/answer model) ──
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [callCaller, setCallCaller] = useState<Role | null>(null);
  const [callConnecting, setCallConnecting] = useState(false);
  const [pricePerMin, setPricePerMin] = useState(DEFAULT_SETTINGS.priceNGN / DEFAULT_SETTINGS.sessionLengthMin);
  const [practitionerName, setPractitionerName] = useState(DEFAULT_SETTINGS.practitionerName);

  // Discount UI state (practitioner only)
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountPct, setDiscountPct] = useState<typeof DISCOUNT_OPTIONS[number]>(25);
  const [discountSending, setDiscountSending] = useState(false);
  const [discountSent, setDiscountSent] = useState(false);
  const [extRequested, setExtRequested] = useState(false); // client has pressed "request more time"
  const [discountCode, setDiscountCode] = useState<string | null>(null);

  // Client info stored in session metadata (sent by system message on session start)
  const [clientEmail, setClientEmail] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientUid, setClientUid] = useState("");

  // ── Practitioner notes panel ──
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

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
  // ── Swipe-to-tag state ──
  const [swipedMsgId, setSwipedMsgId] = useState<string | null>(null);
  // Mobile practitioner FAB
  const [fabOpen, setFabOpen] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);
  const fabDragRef = useRef<{ startX: number; startY: number; elX: number; elY: number } | null>(null);
  const fabDidDragRef = useRef(false); // true if the last pointer-down actually moved
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

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
    getSettings().then((s) => {
      setPricePerMin(s.priceNGN / s.sessionLengthMin);
      if (s.practitionerName) setPractitionerName(s.practitionerName);
    }).catch(() => {});
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

  // ── Presence heartbeat — stop unconditionally when session is complete ──
  // We use a ref to gate the interval so there is zero window where a "complete"
  // status change could allow a stale interval to fire.
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    // Always clear any existing heartbeat first
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    if (!user) return;
    // Hard stop: never ping on a completed or non-live session
    const status = session?.status as string | undefined;
    if (status === "complete") return;
    const uid = user.uid;
    pingPresence(bookingId, uid);
    heartbeatRef.current = setInterval(() => {
      // Double-check inside the interval — session may have completed since interval started
      if ((session?.status as string) === "complete") {
        if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
        return;
      }
      pingPresence(bookingId, uid);
    }, 90_000);
    return () => {
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, user?.uid, session?.status]);

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

  // ── Practitioner notes subscription ──
  // Watch notes for the client in real-time (only when we have the clientUid)
  useEffect(() => {
    if (!isPract || !clientUid) return;
    const unsub = watchClientNotes(clientUid, setNotes);
    return () => unsub();
  }, [isPract, clientUid]);

  // ── Save note handler ──
  const handleSaveNote = async () => {
    const text = noteDraft.trim();
    if (!text || !clientUid) return;
    setNoteSaving(true);
    try {
      await addClientNote(clientUid, text, bookingId);
      setNoteDraft("");
    } catch (err) {
      console.error("Save note error:", err);
      alert("Could not save note. Please try again.");
    } finally {
      setNoteSaving(false);
    }
  };

  // ── Call state subscription ──
  // Watch the call document for incoming calls, connection status, etc.
  useEffect(() => {
    const unsub = watchCallState(bookingId, (state) => {
      setCallStatus(state.status);
      setCallCaller(state.caller ?? null);

      // Auto-cleanup when call ends
      if (state.status === "ended" || state.status === "declined") {
        if (voiceRef.current) {
          voiceRef.current.stop().catch(() => {});
          voiceRef.current = null;
        }
        localStreamRef.current?.getTracks().forEach((tr) => { try { tr.stop(); } catch {} });
        localStreamRef.current = null;
        setVoiceLive(false);
        setMicOn(false);
        setCallConnecting(false);
      }

      // Mark voice live when connected
      if (state.status === "connected") {
        setVoiceLive(true);
        setCallConnecting(false);
      }
    });
    return () => unsub();
  }, [bookingId]);

  // ── Client join / rejoin notification ──
  // First time: send "Client has joined" (neutral, not "rejoined").
  // Subsequent entries after leaving: send "Client has rejoined".
  // We use sessionStorage to track whether the client has left before.
  const hasNotifiedJoinRef = useRef(false);
  useEffect(() => {
    if (!session || session.status !== "live" || isPract) return;
    if (hasNotifiedJoinRef.current) return;
    hasNotifiedJoinRef.current = true;
    const leftBefore = sessionStorage.getItem(`left_session_${bookingId}`) === "1";
    if (leftBefore) {
      sessionStorage.removeItem(`left_session_${bookingId}`);
      clientRejoinedSession(bookingId).catch(() => {});
    } else {
      // First join — send neutral "Client has joined" system message
      clientRejoinedSession(bookingId, true).catch(() => {});
    }
  }, [session, isPract, bookingId]);

  // ── Call handlers (new call/answer model) ──
  const handleStartCall = async () => {
    if (!sessionLive) return;
    setCallConnecting(true);
    try {
      const stream = await getMicStream();
      localStreamRef.current = stream;
      setMicOn(true);

      const handle = await initiateCall({
        bookingId,
        role,
        localStream: stream,
        onRemote: (remoteStream) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(() => {});
          }
        },
        onState: (s) => {
          if (s === "connected") {
            setVoiceLive(true);
            setCallConnecting(false);
          }
        },
      });
      voiceRef.current = handle;

      // Audio level visualizer
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!localStreamRef.current) return;
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += Math.abs(dataArray[i] - 128);
        const avg = sum / dataArray.length / 128;
        setScale(Math.max(0.85, Math.min(1.3, 1 + avg * 1.5)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      console.error("Call initiation error:", err);
      setCallConnecting(false);
      alert("Could not start call. Please check your microphone permissions.");
    }
  };

  const handleAnswerCall = async () => {
    setCallConnecting(true);
    try {
      const stream = await getMicStream();
      localStreamRef.current = stream;
      setMicOn(true);

      const handle = await answerCall({
        bookingId,
        role,
        localStream: stream,
        onRemote: (remoteStream) => {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(() => {});
          }
        },
        onState: (s) => {
          if (s === "connected") {
            setVoiceLive(true);
            setCallConnecting(false);
          }
        },
      });
      voiceRef.current = handle;

      // Audio visualizer
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!localStreamRef.current) return;
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += Math.abs(dataArray[i] - 128);
        const avg = sum / dataArray.length / 128;
        setScale(Math.max(0.85, Math.min(1.3, 1 + avg * 1.5)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      console.error("Answer call error:", err);
      setCallConnecting(false);
      alert("Could not answer call. Please check your microphone permissions.");
    }
  };

  const handleDeclineCall = async () => {
    try {
      await declineCall(bookingId, role);
    } catch (err) {
      console.error("Decline call error:", err);
    }
  };

  const handleEndCall = async () => {
    try {
      if (voiceRef.current) {
        await voiceRef.current.stop();
        voiceRef.current = null;
      }
      localStreamRef.current?.getTracks().forEach((tr) => { try { tr.stop(); } catch {} });
      localStreamRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setMicOn(false);
      setVoiceLive(false);
      // Play call-drop tone so both parties know the call ended
      playCallDropSound();
      await endCall(bookingId, role);
    } catch (err) {
      console.error("End call error:", err);
    }
  };

  // ── Practitioner file upload handler ──
  const handlePractFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX = 20 * 1024 * 1024;
    if (file.size > MAX) { alert("File must be under 20 MB."); return; }
    setPractUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("bookingId", bookingId);
      // Use explicit cors mode and no custom headers (lets browser handle multipart boundary)
      const endpoint = `${API_BASE}/upload`;
      const res = await fetch(endpoint, { method: "POST", mode: "cors", body: form });
      if (!res.ok) {
        let errMsg = `Upload failed (${res.status})`;
        try { const j = await res.json() as { error?: string }; if (j.error) errMsg = j.error; } catch {}
        throw new Error(errMsg);
      }
      const data = await res.json() as { ok: boolean; url: string };
      const uploaded = { url: data.url, type: file.type, name: file.name, size: file.size };
      const isImage = file.type.startsWith("image/");
      const label = isImage ? `🖼️ ${file.name}` : `📎 ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
      await sendMessage(bookingId, role, label, uploaded);
    } catch (err) {
      console.error("Practitioner file share error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      // Give a clear, actionable message
      if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("networkerror")) {
        alert("File upload failed — the file storage service may be unavailable. Please check your internet connection and try again. If this persists, contact support.");
      } else {
        alert(`Could not share file: ${msg}`);
      }
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

  // ── Time warning beeps ──
  // Plays 2 short beeps when remaining time hits 5min and again at 1min.
  // Uses refs to ensure each warning fires exactly once per session.
  const beepedAt5MinRef = useRef(false);
  const beepedAt1MinRef = useRef(false);
  // Track the last endAt we've seen — when it changes (extension), reset all
  // one-shot refs so warnings + auto-end fire again on the new expiry.
  const lastEndAtRef = useRef<number | null>(null);
  const autoEndedRef = useRef(false);
  const playTimeWarningBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      // Two quick beeps
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 1000;
        const start = ctx.currentTime + i * 0.25;
        gain.gain.setValueAtTime(0.15, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
        osc.start(start);
        osc.stop(start + 0.15);
      }
    } catch { /* non-fatal */ }
  };

  // Play 3 descending "call drop" tones when session ends.
  // Mimics the classic phone drop sound: three falling notes.
  const playCallDropSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      // Three descending tones: 880Hz → 660Hz → 440Hz, each 0.22s apart
      const freqs = [880, 660, 440];
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.22;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.22, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
        osc.start(t);
        osc.stop(t + 0.22);
      });
      // Close context after tones finish
      setTimeout(() => { try { ctx.close(); } catch {} }, 1200);
    } catch { /* non-fatal */ }
  };

  // ── Incoming call ring tone ──
  // Plays a gentle double "ding-dong" that loops until the call is answered/declined
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringCtxRef = useRef<AudioContext | null>(null);

  const playDingDong = () => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      ringCtxRef.current = ctx;
      // Two-tone ding (higher) then dong (lower)
      const tones = [
        { freq: 880, start: 0,    dur: 0.25, vol: 0.18 },
        { freq: 660, start: 0.35, dur: 0.3,  vol: 0.14 },
      ];
      tones.forEach(({ freq, start, dur, vol }) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.05);
      });
    } catch { /* non-fatal */ }
  };

  const stopRing = () => {
    if (ringIntervalRef.current) { clearInterval(ringIntervalRef.current); ringIntervalRef.current = null; }
    try { ringCtxRef.current?.close(); } catch {}
    ringCtxRef.current = null;
  };

  // Start/stop ringing based on callStatus.
  // Ring ONLY for the callee (the one who did NOT initiate the call).
  // Guard: if callCaller is still null (first snapshot not yet settled), skip
  // this run — the effect re-fires once callCaller is populated.
  useEffect(() => {
    // Always stop ringing when not in a ringing state
    if (callStatus !== "ringing" || voiceLive) {
      stopRing();
      return () => stopRing();
    }
    // callStatus === "ringing" here.
    // If caller info not yet arrived, do nothing — re-fires when callCaller changes
    if (callCaller === null) return () => {};
    const weAreCallee = callCaller !== role;
    if (weAreCallee) {
      // We were called — ring immediately then loop every 2.2s
      if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
      playDingDong();
      ringIntervalRef.current = setInterval(playDingDong, 2200);
    } else {
      // We are the caller — no ring for ourselves
      stopRing();
    }
    return () => stopRing();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callStatus, callCaller, role, voiceLive]);

  // Check remaining time and fire beeps
  useEffect(() => {
    if (!session || session.status !== "live") return;
    const remainingMs = session.endAt ? session.endAt.toMillis() - now : 0;

    // ── Reset one-shot refs when session is extended ──
    // Must run FIRST — before beep/auto-end checks — so the new deadline
    // gets fresh one-shot guards on the same tick endAt changes.
    const currentEndAt = session?.endAt?.toMillis() ?? null;
    if (currentEndAt !== null && currentEndAt !== lastEndAtRef.current) {
      if (lastEndAtRef.current !== null) {
        // endAt actually changed (not first render) — reset one-shot flags
        beepedAt5MinRef.current = false;
        beepedAt1MinRef.current = false;
        autoEndedRef.current = false;
      }
      lastEndAtRef.current = currentEndAt;
    }

    // 5-minute warning
    if (remainingMs <= 5 * 60_000 && remainingMs > 4 * 60_000 && !beepedAt5MinRef.current) {
      beepedAt5MinRef.current = true;
      playTimeWarningBeep();
    }
    // 1-minute warning
    if (remainingMs <= 60_000 && remainingMs > 30_000 && !beepedAt1MinRef.current) {
      beepedAt1MinRef.current = true;
      playTimeWarningBeep();
    }

    // AUTO-END: When time runs out and session is still live,
    // automatically end the call and block the session for the client.
    // The practitioner can still offer an extension.
    if (remainingMs <= 0 && !autoEndedRef.current) {
      autoEndedRef.current = true;
      // Play session-end tone IMMEDIATELY when timer hits 00:00
      playCallDropSound();
      // End voice call immediately
      if (voiceRef.current) {
        voiceRef.current.stop().catch(() => {});
        voiceRef.current = null;
      }
      localStreamRef.current?.getTracks().forEach((tr) => { try { tr.stop(); } catch {} });
      localStreamRef.current = null;
      setVoiceLive(false);
      setMicOn(false);
      // For client: auto-complete the session after 10 seconds if practitioner
      // hasn't offered an extension
      if (!isPract) {
        setTimeout(() => {
          // Check if an extension offer has been sent OR client has requested one — if not, complete
          watchSession(bookingId, (s) => {
            if (s && s.status === "live" &&
                (!s.offer || s.offer.status !== "sent") &&
                s.clientExtRequest !== "pending") {
              completeSession(bookingId).catch(() => {});
            }
          })();
        }, 15_000); // extended to 15s to give client time to press "request more time"
      }
    }
  }, [now, session]);

  // ── Voice ──
  // joinVoice is replaced by handleStartCall / handleAnswerCall (call/answer model)

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

  // toggleMute is now inline in the call controls UI

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

  // NOTE: Voice is NOT auto-joined. Both parties see a "Join Voice" button
  // and can join individually. This respects user privacy — mic is not
  // activated without explicit consent.

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
          // Re-join after a brief delay (only if user was in voice before)
          setTimeout(() => {
            if (voiceRef.current === null && localStreamRef.current === null) {
              // Voice auto-rejoin disabled in call/answer model
              // User needs to click Call again to reconnect
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

    // ── Play call-drop sound to notify both parties session ended ──
    playCallDropSound();

    // ── Kill ALL audio/voice immediately ──
    // 1. Cancel animation frame (mic meter)
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

    // 2. Stop every local media track
    localStreamRef.current?.getTracks().forEach((tr) => { try { tr.stop(); } catch {} });
    localStreamRef.current = null;

    // 3. Stop WebRTC peer connection (closes ICE transport + remote track)
    voiceRef.current?.stop().catch(() => {});
    voiceRef.current = null;

    // 4. Kill the remote audio element — detach srcObject, pause, and mute
    if (remoteAudioRef.current) {
      try { remoteAudioRef.current.pause(); } catch {}
      try { remoteAudioRef.current.srcObject = null; } catch {}
      try { remoteAudioRef.current.muted = true; } catch {}
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
        window.location.href = "/?session=complete";
      }
    }, 4500);
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

      // 2. Send as a practitioner chat message so client sees it prominently
      await sendMessage(bookingId, "practitioner",
        `I've sent you a ${discountPct}% discount code for your next booking. Code: ${dc.code} — valid for 90 days. You can use it when you book your next session.`
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
      if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("networkerror")) {
        alert("File upload failed — the storage service may be unavailable. Check your internet connection and try again.");
      } else {
        alert(`Could not share file: ${msg}`);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!session) return <div className="room-bg"><div className="center"><p style={{ color: "#fff" }}>Connecting…</p></div></div>;

  // Show redirect screen when complete — but NOT if there's an active extension flow
  const hasActiveExtension = session.offer?.status === "sent" || session.offer?.status === "accepted" ||
    session.clientExtRequest === "pending";
  if (session.status === "complete" && !hasActiveExtension) {
    return (
      <div className="room-bg" style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 52 }}>✅</div>
        <h2 style={{ color: "#fff", margin: 0 }}>Session complete</h2>
        {isPract ? (
          <p style={{ color: "rgba(255,255,255,.6)", margin: 0, fontSize: 15 }}>
            Returning to your dashboard…
          </p>
        ) : (
          <>
            <p style={{ color: "rgba(255,255,255,.7)", margin: 0, fontSize: 16, maxWidth: 320, lineHeight: 1.5 }}>
              Thank you for your session! We hope it was helpful.
            </p>
            <p style={{ color: "rgba(255,255,255,.5)", margin: 0, fontSize: 14 }}>
              You can book your next appointment anytime.
            </p>
            <Link href="/book" style={{
              marginTop: 8, padding: "12px 28px", borderRadius: 12,
              background: "var(--teal)", color: "#fff", fontWeight: 700,
              fontSize: 15, textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}>
              📅 Book Another Session
            </Link>
            <Link href="/" style={{
              marginTop: 4, color: "rgba(255,255,255,.5)", fontSize: 13,
              textDecoration: "none",
            }}>
              ← Back to Home
            </Link>
          </>
        )}
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
    ? `Next client is booked at ${session.nextClientAt}` + (extMinutes >= 30 ? " — this extension may overlap." : " — this extension should still finish in time.")
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
            {isPract ? (clientName || "Client") : practitionerName} {otherOnline ? "online" : "offline"}
          </div>
        </div>
      </div>

      <div className="stage">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
          <h2 style={{margin:0}}>Your session</h2>
          {/* Leave / End Session — outside the box, right of heading */}
          {isPract ? (
            session?.status === "live" && (
              <button
                onClick={async () => {
                  if (!confirm("End this session for both parties?")) return;
                  try { await completeSession(bookingId); }
                  catch (err) { console.error("End session error:", err); alert("Could not end session. Try again."); }
                }}
                style={{
                  display:"flex",alignItems:"center",gap:6,padding:"7px 16px",
                  borderRadius:10,border:"1.5px solid rgba(248,113,113,.55)",
                  background:"rgba(248,113,113,.12)",color:"#F87171",
                  fontSize:13,fontWeight:700,cursor:"pointer",transition:"all .15s",
                }}
                onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(248,113,113,.24)";}}
                onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(248,113,113,.12)";}}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                End Session
              </button>
            )
          ) : (
            <button
              onClick={() => setShowLeaveConfirm(true)}
              style={{
                display:"flex",alignItems:"center",gap:6,padding:"7px 16px",
                borderRadius:10,border:"1.5px solid rgba(248,113,113,.55)",
                background:"rgba(248,113,113,.12)",color:"#F87171",
                fontSize:13,fontWeight:700,cursor:"pointer",transition:"all .15s",
              }}
              onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(248,113,113,.24)";}}
              onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(248,113,113,.12)";}}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Leave
            </button>
          )}
        </div>
        <p className="sub">{isPract ? "You are hosting your client." : "Your session with your practitioner."}</p>

        <div className="pane">
          <div className="pane-h">
            {/* Avatar + online dot — no label text */}
            <div className="who">
              <div style={{position:"relative",flexShrink:0}}>
                <div className={"avatar " + (isPract ? "cl" : "dr")}>
                  {isPract
                    ? (clientName ? clientName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() : "CL")
                    : practitionerName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
                  }
                </div>
                <span style={{
                  position:"absolute",bottom:0,right:0,
                  width:9,height:9,borderRadius:"50%",
                  background:otherOnline?"#4ade80":"#94a3b8",
                  border:"1.5px solid #1a2a4a",
                  boxShadow:otherOnline?"0 0 0 2px rgba(74,222,128,.35)":"none",
                  transition:"all .3s",
                }} />
              </div>
              {/* Mic visualizer — only shown during an active voice call */}
              {voiceLive && micOn && localStreamRef.current && (
                <div style={{display:"flex",alignItems:"flex-end",gap:1.5,height:12,marginLeft:6}}>
                  {[0.4,0.7,1,0.6,0.85].map((h,i) => (
                    <div key={i} style={{
                      width:3,height:`${h*scale*12}px`,borderRadius:2,
                      background:`rgba(74,222,128,${0.5+h*0.5})`,
                      transition:"height .1s",minHeight:2
                    }} />
                  ))}
                </div>
              )}
            </div>
            {/* Call + Video icons — flat SVG, right side */}
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {/* Voice call button — greyed out and disabled when session has ended */}
              {complete ? (
                /* Session ended — show greyed-out disabled phone icon */
                <button
                  disabled
                  title="Session has ended"
                  style={{
                    display:"flex",alignItems:"center",justifyContent:"center",
                    width:36,height:36,borderRadius:10,border:"1.5px solid rgba(255,255,255,.12)",
                    background:"rgba(255,255,255,.05)",color:"rgba(255,255,255,.2)",
                    cursor:"not-allowed",transition:"all .15s",padding:0,opacity:0.45,
                  }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.47 2 2 0 0 1 3.59 1.3h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.29 6.29l1.02-.88a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                </button>
              ) : sessionLive && (
                voiceLive ? (
                  /* Active call — red end button */
                  <button
                    onClick={handleEndCall}
                    title="End voice call"
                    style={{
                      display:"flex",alignItems:"center",justifyContent:"center",
                      width:36,height:36,borderRadius:10,border:"1.5px solid rgba(248,113,113,.55)",
                      background:"rgba(248,113,113,.18)",color:"#F87171",
                      cursor:"pointer",transition:"all .15s",padding:0,
                    }}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M1.5 4.5C3 3 5.5 3 7 4.5l2 2c1.5 1.5 1.5 3.5 0 5l-.5.5c1 2 2.5 3.5 4.5 4.5l.5-.5c1.5-1.5 3.5-1.5 5 0l2 2c1.5 1.5 1.5 4 0 5.5C19 25 2 19 1.5 4.5z" opacity="0.9"/>
                      <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                ) : callStatus === "ringing" && callCaller === role ? (
                  /* Outgoing ringing — dim cancel button */
                  <button
                    onClick={handleEndCall}
                    title="Cancel call"
                    style={{
                      display:"flex",alignItems:"center",justifyContent:"center",
                      width:36,height:36,borderRadius:10,border:"1.5px solid rgba(248,113,113,.3)",
                      background:"rgba(248,113,113,.1)",color:"rgba(248,113,113,.7)",
                      cursor:"pointer",transition:"all .15s",padding:0,
                    }}
                  >
                    {/* Phone-slash: filled phone receiver + diagonal slash — universally understood "end call" */}
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M1.5 4.5C3 3 5.5 3 7 4.5l2 2c1.5 1.5 1.5 3.5 0 5l-.5.5c1 2 2.5 3.5 4.5 4.5l.5-.5c1.5-1.5 3.5-1.5 5 0l2 2c1.5 1.5 1.5 4 0 5.5C19 25 2 19 1.5 4.5z" opacity="0.9"/>
                      <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                ) : (
                  /* Idle / ended / declined — green start-call button always visible */
                  <button
                    onClick={handleStartCall}
                    disabled={callConnecting || callStatus === "ringing"}
                    title={callConnecting ? "Connecting…" : "Start voice call"}
                    style={{
                      display:"flex",alignItems:"center",justifyContent:"center",
                      width:36,height:36,borderRadius:10,
                      border:"1.5px solid rgba(74,222,128,.45)",
                      background:"rgba(255,255,255,.06)",
                      color:"rgba(255,255,255,.75)",
                      cursor: callConnecting ? "not-allowed" : "pointer",
                      transition:"all .15s",padding:0,
                      opacity: callConnecting ? 0.55 : 1,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.47 2 2 0 0 1 3.59 1.3h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.29 6.29l1.02-.88a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                  </button>
                )
              )}
              {/* Video icon — visual only (no video in this version) */}
              <div
                title="Video not available in this version"
                style={{
                  display:"flex",alignItems:"center",justifyContent:"center",
                  width:36,height:36,borderRadius:10,border:"1.5px solid rgba(255,255,255,.12)",
                  background:"rgba(255,255,255,.04)",color:"rgba(255,255,255,.25)",
                  cursor:"not-allowed",padding:0,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
              </div>
            </div>
          </div>

          {/* ── Voice panel with call/answer model ── */}
          <div className="voice">
            <div className={"timer num " + timerCls}>{fmt(remaining)}</div>
            <div className="tl tl-sm">{complete ? "Session time complete" : "Session time remaining"}</div>
            {/* Orb — only visible during active voice call */}
            {(voiceLive || callStatus === "ringing") && (
              <div className="orb" style={{ transform: `scale(${scale})` }}>
                {voiceLive ? (
                  micOn ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
                      <line x1="1" y1="1" x2="23" y2="23"/>
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                  )
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.47 2 2 0 0 1 3.59 1.3h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.29 6.29l1.02-.88a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                )}
              </div>
            )}
            {!sessionLive && !isPract && (
              <div className="session-not-started-banner">
                ⏳ Waiting for practitioner to start the session…
              </div>
            )}
            {!sessionLive && isPract && (
              <button
                className="session-start-banner-btn"
                onClick={() => startSession(bookingId, session?.durationMin ?? DEFAULT_SETTINGS.sessionLengthMin)}
                style={{
                  marginTop: 10,
                  padding: "10px 24px",
                  borderRadius: 12,
                  border: "2px solid var(--teal)",
                  background: "rgba(14,138,122,.18)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  transition: "all .2s",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                Start Session
              </button>
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

            {/* ── Incoming call notification ── */}
            {callStatus === "ringing" && callCaller !== role && !voiceLive && (
              <div className="incoming-call-banner" style={{
                marginTop: 12,
                padding: "12px 16px",
                borderRadius: 12,
                background: "linear-gradient(135deg,#0E8A7A,#0B2B4A)",
                color: "#fff",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                alignItems: "center",
                animation: "pingBlink 1.5s infinite",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  📞 {callCaller === "practitioner" ? practitionerName : (clientName || "Client")} is calling you…
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    onClick={handleAnswerCall}
                    disabled={callConnecting}
                    style={{
                      padding: "8px 20px", borderRadius: 10, border: "none",
                      background: "#22c55e", color: "#fff", fontWeight: 700,
                      fontSize: 13, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    📞 Answer
                  </button>
                  <button
                    onClick={handleDeclineCall}
                    style={{
                      padding: "8px 20px", borderRadius: 10, border: "none",
                      background: "#ef4444", color: "#fff", fontWeight: 700,
                      fontSize: 13, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    ✕ Decline
                  </button>
                </div>
              </div>
            )}

            {/* ── Calling... indicator (for caller while ringing) ── */}
            {callStatus === "ringing" && callCaller === role && !voiceLive && (
              <div style={{
                marginTop: 8, fontSize: 12, color: "rgba(255,255,255,.6)",
                display: "flex", alignItems: "center", gap: 6, justifyContent: "center",
              }}>
                <span style={{ animation: "pingBlink 1s infinite" }}>📞</span>
                Calling… waiting for answer
              </div>
            )}

            <div className="vn">
              {voiceLive ? "Voice connected" :
               callStatus === "ringing" ? (callCaller === role ? "Calling…" : "Incoming call") :
               callConnecting ? "Connecting…" :
               sessionLive ? "" : ""}
            </div>

            {/* Call controls now in pane-h header */}
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
                  const isSwiped = swipedMsgId === m.id;
                  // Decode @@JOIN perspective-aware join message (no emojis)
                  let displayText = m.text;
                  if (m.from === "system" && m.text.startsWith("@@JOIN|")) {
                    const parts = m.text.split("|");
                    const cName = parts[1] || "Client";
                    const dName = parts[2] || "Dr. Fat";
                    const joined = parts[3] === "1" ? "joined" : "rejoined";
                    displayText = isPract ? `${cName} has ${joined} the session.` : `${dName} has ${joined} the session.`;
                  }
                  return (
                    <div
                      key={m.id}
                      className={"msg-wrapper " + cls}
                      style={{ marginBottom: 4 }}
                    >
                      {/* Swipe action button — left for mine (swiped left), right for theirs (swiped right) */}
                      {canReply && (
                        <button
                          className="swipe-tag-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReplyTo({ id: m.id, text: m.text, from: m.from });
                            setSwipedMsgId(null);
                          }}
                          style={{
                            position: "absolute",
                            ...(cls === "mine" ? { left: 4 } : { right: 4 }),
                            top: "50%",
                            transform: "translateY(-50%)",
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "none",
                            background: "var(--teal)",
                            color: "#fff",
                            fontSize: 13,
                            cursor: "pointer",
                            opacity: isSwiped ? 1 : 0,
                            pointerEvents: isSwiped ? "auto" : "none",
                            transition: "opacity .2s",
                            zIndex: 1,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            whiteSpace: "nowrap",
                          }}
                          title="Reply to this message"
                        >
                          ↩ Reply
                        </button>
                      )}
                    <div
                      className={"msg " + cls}
                      onTouchStart={(e) => {
                        if (!canReply) return;
                        touchStartX.current = e.touches[0].clientX;
                        touchStartY.current = e.touches[0].clientY;
                      }}
                      onTouchEnd={(e) => {
                        if (!canReply) return;
                        const dx = e.changedTouches[0].clientX - touchStartX.current;
                        const dy = e.changedTouches[0].clientY - touchStartY.current;
                        const isHoriz = Math.abs(dx) > Math.abs(dy) * 1.5;
                        if (!isHoriz) return;
                        // mine (right side) → swipe LEFT to tag instantly
                        // theirs (left side) → swipe RIGHT to tag instantly
                        const isMine = cls === "mine";
                        if ((isMine && dx < -40) || (!isMine && dx > 40)) {
                          // Auto-tag immediately — no extra tap needed
                          setReplyTo({ id: m.id, text: m.text, from: m.from });
                          setSwipedMsgId(null);
                        }
                      }}
                      onClick={() => {
                        // On desktop, click still works for reply
                        if (canReply && !("ontouchstart" in window)) {
                          setReplyTo({ id: m.id, text: m.text, from: m.from });
                        }
                        // Close swiped state on click
                        if (isSwiped) setSwipedMsgId(null);
                      }}
                      style={{
                        position: "relative",
                        transform: isSwiped
                          ? (cls === "mine" ? "translateX(-60px)" : "translateX(60px)")
                          : "translateX(0)",
                        transition: "transform .2s ease",
                        zIndex: 2,
                      }}
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
                      {(!isImage && !isDoc) && <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{displayText}</span>}
                      {(isImage || isDoc) && (
                        <span style={{fontSize:11,opacity:.6,display:"block",marginTop:3,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
                          {m.text.replace(/^[🖼️📎]+\s*/,"")}
                        </span>
                      )}
                      {m.from !== "system" && (
                        <div className="t">{new Date(m.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                      )}
                    </div>
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
                placeholder={complete
                  ? "Session has ended."
                  : sessionLive
                    ? (isPract ? "Message your client…" : "Message…")
                    : (isPract ? "Start the session to enable chat…" : "Waiting for practitioner to start…")}
                disabled={!sessionLive || complete}
                style={{
                  ...((!sessionLive || complete) ? {opacity:.45, cursor:"not-allowed"} : {}),
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
              <button onClick={send} disabled={!sessionLive || complete} style={(!sessionLive || complete) ? {opacity:.45} : {}}>↑</button>
            </div>
          </div>

          {/* Overlays */}
          {renderOverlay()}
          {/* Extend Time panel — available anytime during a live session */}
          {isPract && showExtendNow && sessionLive && (
            <div className="overlay" style={{ zIndex: 50 }}>
              <div className="ov-icon">⏱</div>
              <h3>Offer more time</h3>
              <p style={{ color: "rgba(255,255,255,.7)", fontSize: 14, margin: "0 0 16px" }}>
                Add extra time to the ongoing session.
              </p>
              {queueWarn && <p style={{ color: "#F5D08A", fontSize: 13, marginBottom: 12 }}>{queueWarn}</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 260 }}>
                <div>
                  <label style={{ fontSize: 12, color: "rgba(255,255,255,.7)", fontWeight: 600 }}>Extension minutes</label>
                  <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    {[5, 10, 15, 20, 30].map(mn => (
                      <button key={mn} onClick={() => setExtMinutes(mn)}
                        style={{
                          padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                          background: extMinutes === mn ? "var(--teal)" : "rgba(255,255,255,.12)",
                          color: "#fff", fontWeight: 700, fontSize: 13, transition: "all .15s",
                        }}>+{mn}m</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "rgba(255,255,255,.7)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>Amount to pay (₦)</span>
                    <button onClick={() => setExtIsFree(!extIsFree)}
                      style={{
                        padding: "3px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                        background: extIsFree ? "var(--teal)" : "rgba(255,255,255,.12)",
                        color: "#fff", fontWeight: 600, fontSize: 11,
                      }}>{extIsFree ? "✓ Free" : "Mark as free"}</button>
                  </label>
                  <input
                    type="number"
                    value={extIsFree ? 0 : extAmount}
                    disabled={extIsFree}
                    onChange={e => setExtAmount(Math.max(0, +e.target.value))}
                    placeholder="0"
                    style={{
                      width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 8,
                      border: "1.5px solid rgba(255,255,255,.2)",
                      background: extIsFree ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.1)",
                      color: "#fff", fontSize: 15, outline: "none", fontFamily: "inherit",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="obtn ghost"
                    onClick={() => setShowExtendNow(false)}
                    style={{ flex: 1 }}
                  >Cancel</button>
                  <button
                    className="obtn amber"
                    disabled={extMinutes === 0}
                    onClick={async () => {
                      if (!extMinutes) return;
                      try {
                        await setOffer(bookingId, {
                          minutes: extMinutes,
                          priceNGN: extIsFree ? 0 : extAmount,
                          isFree: extIsFree,
                          status: "sent",
                        });
                        setShowExtendNow(false);
                        setChosen(extMinutes);
                      } catch (err) {
                        console.error("Offer extension error:", err);
                        alert("Could not send extension offer. Check your connection.");
                      }
                    }}
                    style={{ flex: 2 }}
                  >Send offer to client</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Practitioner dock — desktop bar + mobile FAB ── */}
        {isPract && (
          <>
          {/* Mobile FAB — only shown on small screens via CSS */}
          <div
            ref={fabRef}
            className={"pract-fab" + (fabOpen ? " open" : "")}
            data-side={fabPos
              ? (fabPos.x < window.innerWidth / 2 ? "left" : "right")
              : "right"}
            style={fabPos ? { bottom: "auto", right: "auto", left: fabPos.x, top: fabPos.y } : {}}
            onPointerDown={(e) => {
              const el = fabRef.current;
              if (!el) return;
              const rect = el.getBoundingClientRect();
              fabDragRef.current = { startX: e.clientX, startY: e.clientY, elX: rect.left, elY: rect.top };
              fabDidDragRef.current = false; // reset drag flag on every new touch
              el.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!fabDragRef.current) return;
              const dx = e.clientX - fabDragRef.current.startX;
              const dy = e.clientY - fabDragRef.current.startY;
              if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                fabDidDragRef.current = true; // real drag — suppress subsequent onClick
                const newX = Math.max(8, Math.min(window.innerWidth - 64, fabDragRef.current.elX + dx));
                const newY = Math.max(8, Math.min(window.innerHeight - 64, fabDragRef.current.elY + dy));
                setFabPos({ x: newX, y: newY });
              }
            }}
            onPointerUp={() => {
              fabDragRef.current = null;
              // Toggle is handled by onClick on the .fab-toggle button below.
              // We only clear the drag ref here.
            }}
          >
            {/* FAB toggle button — gear icon (SVG).
                 onClick fires reliably after pointer capture is released.
                 We guard against it firing after a real drag using fabDidDragRef. */}
            <button
              className="fab-toggle"
              aria-label="Practitioner controls"
              onClick={(e) => {
                e.stopPropagation();
                if (fabDidDragRef.current) return; // was a drag, not a tap
                setFabOpen(v => !v);
              }}
            >
              {fabOpen
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              }
            </button>
            {fabOpen && (
              <div className="fab-menu" onClick={e => e.stopPropagation()}>
                {(session.status as string) !== "live" && (session.status as string) !== "complete" && (
                  <button className="fab-action" onClick={() => { startSession(bookingId, session.durationMin); setFabOpen(false); }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                    Start Session
                  </button>
                )}
                <button
                  className={"fab-action" + (discountSent ? " fab-action-success" : "")}
                  onClick={() => { setShowDiscount(!showDiscount); setDiscountSent(false); setFabOpen(false); }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
                  {discountSent ? "Discount Sent ✓" : "Give Discount"}
                </button>
                <button
                  className={"fab-action" + (showNotes ? " fab-action-active" : "")}
                  onClick={() => { setShowNotes(!showNotes); setFabOpen(false); }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  Session Notes
                </button>
                {sessionLive && (
                  <button
                    className="fab-action"
                    onClick={() => {
                      if (complete) {
                        setChosen(0); // post-timer overlay flow
                      } else {
                        setShowExtendNow(true); // live-session extend panel
                      }
                      setFabOpen(false);
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg>
                    Extend Time
                  </button>
                )}
                {sessionLive && (
                  <button
                    className="fab-action"
                    onClick={() => { practFileRef.current?.click(); setFabOpen(false); }}
                    disabled={practUploading}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                    {practUploading ? "Uploading…" : "Share File"}
                  </button>
                )}
                <button
                  className={"fab-action fab-action-toggle" + (attachmentsOn ? " fab-action-active" : "")}
                  onClick={() => setAttachmentsEnabled(bookingId, !attachmentsOn)}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                  Client Uploads
                  <span className={"fab-sw" + (attachmentsOn ? " on" : "")} />
                </button>
                {nextClientLabel && (
                  <div className="fab-info">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Next at {nextClientLabel}
                  </div>
                )}
              </div>
            )}
          </div>
                    {/* ── Discount panel — floats above FAB, visible on mobile AND desktop ── */}
          {isPract && showDiscount && (
            <div style={{
              position:"fixed",bottom:90,right:20,zIndex:120,
              background:"rgba(10,28,55,0.97)",border:"1.5px solid rgba(255,255,255,.18)",
              borderRadius:16,padding:"16px 16px 14px",minWidth:230,maxWidth:280,
              boxShadow:"0 8px 32px rgba(0,0,0,.5)",
            }}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <span style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.9)"}}>🎁 Client Discount</span>
                <button onClick={()=>setShowDiscount(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",cursor:"pointer",fontSize:18,lineHeight:1,padding:0}}>×</button>
              </div>
              {clientName && (
                <div style={{fontSize:11,color:"rgba(255,255,255,.55)",marginBottom:8}}>For: {clientName}</div>
              )}
              <div style={{display:"flex",gap:5,marginBottom:10}}>
                {DISCOUNT_OPTIONS.map(p => (
                  <button
                    key={p}
                    onClick={() => setDiscountPct(p)}
                    style={{
                      flex:1,padding:"7px 0",borderRadius:8,border:"1.5px solid",
                      fontSize:12,fontWeight:700,cursor:"pointer",transition:"all .15s",
                      background:discountPct===p?"var(--teal)":"transparent",
                      color:discountPct===p?"#fff":"rgba(255,255,255,.65)",
                      borderColor:discountPct===p?"var(--teal)":"rgba(255,255,255,.18)",
                    }}
                  >{p}%</button>
                ))}
              </div>
              {discountSent && (
                <div style={{fontSize:12,color:"#4ade80",marginBottom:8,fontWeight:600}}>
                  ✓ Sent: {discountCode}
                </div>
              )}
              <button
                style={{
                  width:"100%",padding:"9px 0",borderRadius:9,border:"none",
                  background: discountSending || !clientEmail ? "rgba(255,255,255,.1)" : "var(--teal)",
                  color: discountSending || !clientEmail ? "rgba(255,255,255,.35)" : "#fff",
                  fontWeight:700,fontSize:13,
                  cursor: discountSending || !clientEmail ? "not-allowed" : "pointer",
                  fontFamily:"inherit",transition:"all .15s",
                }}
                onClick={sendDiscount}
                disabled={discountSending || !clientEmail}
              >
                {!clientEmail ? "Waiting for client info…" : discountSending ? "Sending…" : `Send ${discountPct}% off`}
              </button>
            </div>
          )}

          {/* Desktop dock — hidden on mobile */}
          <div className="dock">
            <span className="lbl">Controls</span>
            {(session.status as string) !== "live" && (session.status as string) !== "complete" && (
              <button className="dbtn primary" onClick={() => startSession(bookingId, session.durationMin)}>
                Start session
              </button>
            )}
            {/* End session moved to top-right of "Your session" heading */}

            {/* Gift icon only — no text, tooltip explains */}
            <button
              className={"dbtn icon-only" + (discountSent ? " success" : "")}
              onClick={() => { setShowDiscount(!showDiscount); setDiscountSent(false); }}
              title={discountSent ? `Discount sent: ${discountCode}` : "Give client a discount code"}
            >
              {discountSent ? "✓" : "🎁"}
            </button>

            {/* Discount picker panel — compact */}
            {showDiscount && (
              <div className="discount-panel" style={{minWidth:200}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.8)"}}>Client Discount</span>
                  <button onClick={()=>setShowDiscount(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",cursor:"pointer",fontSize:16,lineHeight:1,padding:0}}>×</button>
                </div>
                <div style={{display:"flex",gap:5,marginBottom:8}}>
                  {DISCOUNT_OPTIONS.map(p => (
                    <button
                      key={p}
                      onClick={() => setDiscountPct(p)}
                      style={{
                        flex:1,padding:"5px 0",borderRadius:7,border:"1.5px solid",
                        fontSize:12,fontWeight:700,cursor:"pointer",transition:"all .15s",
                        background:discountPct===p?"var(--teal)":"transparent",
                        color:discountPct===p?"#fff":"rgba(255,255,255,.65)",
                        borderColor:discountPct===p?"var(--teal)":"rgba(255,255,255,.18)",
                      }}
                    >{p}%</button>
                  ))}
                </div>
                <button
                  style={{
                    width:"100%",padding:"8px 0",borderRadius:8,border:"none",
                    background:"var(--teal)",color:"#fff",fontWeight:700,fontSize:13,
                    cursor:discountSending?"not-allowed":"pointer",opacity:discountSending?.7:1,
                    fontFamily:"inherit",
                  }}
                  onClick={sendDiscount}
                  disabled={discountSending}
                >
                  {discountSending ? "Sending…" : `Send ${discountPct}% off`}
                </button>
              </div>
            )}

            {/* ── Practitioner Notes button + slide-in panel ── */}
            <button
              className={"dbtn icon-only" + (showNotes ? " active" : "")}
              onClick={() => setShowNotes(!showNotes)}
              title="View and add session notes for this client"
              style={showNotes ? { background: "var(--teal)", color: "#fff" } : {}}
            >
              📝
            </button>

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
          </> /* end isPract fragment */
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
              // End call if active
              if (voiceRef.current) {
                await handleEndCall();
              }
              // Mark left so on return we show "rejoined" not "joined"
              sessionStorage.setItem(`left_session_${bookingId}`, "1");
              // Send leave notification and update booking
              await clientLeftSession(bookingId).catch(() => {});
              voiceRef.current?.stop().catch(() => {});
              voiceRef.current = null;
              localStreamRef.current?.getTracks().forEach((tr) => { try { tr.stop(); } catch {} });
              localStreamRef.current = null;
              window.location.href = "/?session=left";
            }}>
              Yes, leave session
            </button>
          </div>
        </div>
      )}

      {/* ── Practitioner Notes slide-in panel ── */}
      {isPract && showNotes && (
        <div className="notes-panel-overlay" onClick={() => setShowNotes(false)}>
          <div className="notes-panel" onClick={(e) => e.stopPropagation()}>
            <div className="notes-panel-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>📝</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--navy)" }}>
                    Session Notes
                  </div>
                  {clientName && (
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {clientName}{clientEmail ? ` · ${clientEmail}` : ""}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowNotes(false)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 20, color: "var(--muted)", padding: 0,
                }}
                title="Close notes"
              >×</button>
            </div>

            {/* Add new note */}
            <div className="notes-add">
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Write a note about this client or session…"
                style={{
                  width: "100%", minHeight: 60, maxHeight: 120,
                  border: "1.5px solid var(--line)", borderRadius: 10,
                  padding: "10px 12px", fontSize: 13, fontFamily: "inherit",
                  resize: "vertical", outline: "none", background: "var(--paper)",
                  boxSizing: "border-box",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSaveNote();
                  }
                }}
              />
              <button
                onClick={handleSaveNote}
                disabled={!noteDraft.trim() || noteSaving || !clientUid}
                style={{
                  marginTop: 8, padding: "8px 16px", borderRadius: 10,
                  border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
                  background: (!noteDraft.trim() || noteSaving || !clientUid) ? "var(--line)" : "var(--teal)",
                  color: (!noteDraft.trim() || noteSaving || !clientUid) ? "var(--muted)" : "#fff",
                  transition: "all .15s",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {noteSaving ? "Saving…" : "+ Add note"}
              </button>
              {!clientUid && (
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  Waiting for client data…
                </div>
              )}
            </div>

            {/* Past notes — scrollable list */}
            <div className="notes-list">
              {notes.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)", fontSize: 13 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🗒️</div>
                  No notes yet for this client.
                  <br />
                  Notes you write here will also appear on the client detail page.
                </div>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className="note-card">
                    <div className="note-text">{note.text}</div>
                    <div className="note-meta">
                      {new Date(note.createdAt.toMillis()).toLocaleDateString("en-NG", {
                        day: "numeric", month: "short", year: "numeric",
                      })} ·{" "}
                      {new Date(note.createdAt.toMillis()).toLocaleTimeString("en-NG", {
                        hour: "2-digit", minute: "2-digit",
                      })}
                      {note.bookingId && note.bookingId === bookingId && (
                        <span style={{ marginLeft: 6, color: "var(--teal)", fontWeight: 600 }}>
                          · this session
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function renderOverlay() {
    if (!session) return null;
    const clientRequested = session.clientExtRequest === "pending";

    // ════════════════════════════════════════════════════════════════
    // PRACTITIONER OVERLAYS
    // ════════════════════════════════════════════════════════════════
    if (isPract) {
      // 1. Client has requested an extension — practitioner sees offer form
      if (clientRequested && offer?.status !== "sent" && offer?.status !== "accepted") {
        return (
          <div className="overlay">
            <div className="ov-icon">🙋</div>
            <h3>Client requests more time</h3>
            <p>Your client would like to extend the session. Offer them extra time below.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16, minWidth: 260 }}>
              <div>
                <label style={{ fontSize: 12, color: "rgba(255,255,255,.7)", fontWeight: 600 }}>Extension minutes</label>
                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  {[5, 10, 15, 20, 30].map(m => (
                    <button key={m} onClick={() => setExtMinutes(m)}
                      style={{
                        padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                        background: extMinutes === m ? "var(--teal)" : "rgba(255,255,255,.12)",
                        color: "#fff", fontWeight: 700, fontSize: 13, transition: "all .15s",
                      }}>+{m}m</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "rgba(255,255,255,.7)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>Amount to pay (₦)</span>
                  <button onClick={() => setExtIsFree(!extIsFree)}
                    style={{
                      padding: "3px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                      background: extIsFree ? "var(--teal)" : "rgba(255,255,255,.12)",
                      color: "#fff", fontWeight: 600, fontSize: 11,
                    }}>{extIsFree ? "✓ Free" : "Mark as free"}</button>
                </label>
                <input
                  type="number"
                  value={extIsFree ? 0 : extAmount}
                  disabled={extIsFree}
                  onChange={e => setExtAmount(Math.max(0, +e.target.value))}
                  placeholder="0"
                  style={{
                    width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 8,
                    border: "1.5px solid rgba(255,255,255,.2)", background: extIsFree ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.1)",
                    color: "#fff", fontSize: 15, outline: "none", fontFamily: "inherit",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button className="obtn amber" style={{ flex: 1 }} onClick={() => {
                  setChosen(extMinutes);
                  setOffer(bookingId, { minutes: extMinutes, priceNGN: extIsFree ? 0 : extAmount, status: "sent", isFree: extIsFree });
                  clearExtRequest(bookingId);
                }}>
                  {extIsFree ? `Offer +${extMinutes} min (FREE)` : `Offer +${extMinutes} min · ${ngn(extAmount)}`}
                </button>
              </div>
              <button className="obtn ghost" onClick={async () => {
                clearExtRequest(bookingId);
                await completeSession(bookingId);
              }}>Decline & end session</button>
            </div>
          </div>
        );
      }

      // 2. Extension offer sent — waiting for client to accept/pay
      if (offer?.status === "sent") {
        return (
          <div className="overlay">
            <div className="ov-icon">⏳</div>
            <h3>Extension offer sent</h3>
            <p>Offered +{offer.minutes} min{offer.isFree || offer.priceNGN === 0 ? " (FREE)" : ` (${ngn(offer.priceNGN)})`}. Waiting for the client to accept{offer.isFree || offer.priceNGN === 0 ? "…" : " and pay…"}</p>
            {/* For free extensions, auto-confirm immediately */}
            {offer.isFree && (
              <div className="ov-actions">
                <button className="obtn amber" onClick={() => {
                  confirmExtension(bookingId, session);
                  setChosen(null);
                }}>Confirm & resume (free)</button>
              </div>
            )}
          </div>
        );
      }

      // 3. Client accepted and paid — practitioner confirms
      if (offer?.status === "accepted") {
        return (
          <div className="overlay">
            <div className="ov-icon">✅</div>
            <h3>Payment confirmed</h3>
            <p>Client has paid for +{offer.minutes} min. Tap below to resume the session.</p>
            <div className="ov-actions">
              <button className="obtn amber" onClick={() => {
                confirmExtension(bookingId, session);
                setChosen(null);
              }}>Confirm &amp; resume</button>
            </div>
          </div>
        );
      }

      // 4. Timer ran out — practitioner sees options
      if (!complete) return null;
      if (chosen === null) {
        return (
          <div className="overlay">
            <div className="ov-icon">⌛</div>
            <h3>Time&apos;s up</h3>
            <p>The session time has elapsed. You can offer the client extra time or end the session.</p>
            <div className="ov-actions">
              <button className="obtn amber" onClick={() => setChosen(0)}>+ Offer more time</button>
              <button className="obtn red" onClick={async () => {
                try { await completeSession(bookingId); }
                catch (err) { console.error(err); alert("Could not end session — check connection and try again."); }
              }}>End session</button>
            </div>
          </div>
        );
      }
      // 5. Practitioner manually offering time (timer ran out, they chose to offer)
      if (chosen === 0) {
        return (
          <div className="overlay">
            <div className="ov-icon">⏱</div>
            <h3>Offer more time</h3>
            {queueWarn && <p className="warn-txt" style={{ color: "#F5D08A", fontSize: 13, marginBottom: 12 }}>{queueWarn}</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 260 }}>
              <div>
                <label style={{ fontSize: 12, color: "rgba(255,255,255,.7)", fontWeight: 600 }}>Extension minutes</label>
                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  {[5, 10, 15, 20, 30].map(m => (
                    <button key={m} onClick={() => setExtMinutes(m)}
                      style={{
                        padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                        background: extMinutes === m ? "var(--teal)" : "rgba(255,255,255,.12)",
                        color: "#fff", fontWeight: 700, fontSize: 13,
                      }}>+{m}m</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "rgba(255,255,255,.7)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>Amount to pay (₦)</span>
                  <button onClick={() => setExtIsFree(!extIsFree)}
                    style={{
                      padding: "3px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                      background: extIsFree ? "var(--teal)" : "rgba(255,255,255,.12)",
                      color: "#fff", fontWeight: 600, fontSize: 11,
                    }}>{extIsFree ? "✓ Free" : "Mark as free"}</button>
                </label>
                <input
                  type="number"
                  value={extIsFree ? 0 : extAmount}
                  disabled={extIsFree}
                  onChange={e => setExtAmount(Math.max(0, +e.target.value))}
                  placeholder="0"
                  style={{
                    width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 8,
                    border: "1.5px solid rgba(255,255,255,.2)", background: extIsFree ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.1)",
                    color: "#fff", fontSize: 15, outline: "none", fontFamily: "inherit",
                  }}
                />
              </div>
              <button className="obtn amber" style={{ width: "100%" }} onClick={() => {
                setChosen(extMinutes);
                setOffer(bookingId, { minutes: extMinutes, priceNGN: extIsFree ? 0 : extAmount, status: "sent", isFree: extIsFree });
              }}>
                {extIsFree ? `Offer +${extMinutes} min (FREE)` : `Offer +${extMinutes} min · ${ngn(extAmount)}`}
              </button>
              <button className="obtn ghost" onClick={() => completeSession(bookingId)}>
                No, end session
              </button>
            </div>
          </div>
        );
      }
      // 6. Waiting for client to accept the offer
      return (
        <div className="overlay">
          <div className="ov-icon">💬</div>
          <h3>Extension offered</h3>
          <p>Waiting for your client to accept +{chosen} min{offer?.isFree || offer?.priceNGN === 0 ? " (FREE)" : ""}…</p>
        </div>
      );
    }

    // ════════════════════════════════════════════════════════════════
    // CLIENT OVERLAYS
    // ════════════════════════════════════════════════════════════════
    // 0. Practitioner declined extension — show message before session completes
    if (offer?.status === "declined") {
      return (
        <div className="overlay">
          <div className="ov-icon">📅</div>
          <h3>Extension not available</h3>
          <p>{practitionerName} has another session and can&apos;t offer an extension right now. Please reschedule for continued care.</p>
          <div className="ov-actions">
            <button className="obtn amber" onClick={() => { window.location.href = "/book"; }}>Book another session</button>
            <button className="obtn ghost" onClick={() => { window.location.href = "/"; }}>Return home</button>
          </div>
        </div>
      );
    }
    // 1. Client sees offer from practitioner (paid or free)
    if (offer?.status === "sent") {
      const isFree = offer.isFree || offer.priceNGN === 0;
      return (
        <div className="overlay">
          <div className="ov-icon">{isFree ? "🎁" : "⏰"}</div>
          <h3>{isFree ? "Free extra time!" : "Extra time available"}</h3>
          <p>Your practitioner is offering an additional {offer.minutes} minutes{isFree ? " for free!" : ` for ${ngn(offer.priceNGN)}.`} Would you like to continue?</p>
          <div className="ov-actions">
            {isFree ? (
              <button className="obtn amber" onClick={() => {
                // Free extension — accept without payment
                setOffer(bookingId, { ...offer, status: "accepted" });
              }}>Accept free extension</button>
            ) : (
              <button className="obtn amber" onClick={acceptOffer}>Accept &amp; pay</button>
            )}
            <button className="obtn ghost" onClick={() => { setOffer(bookingId, { ...offer, status: "declined" }); }}>No thanks</button>
          </div>
        </div>
      );
    }
    // 2. Client accepted — waiting for practitioner to confirm
    if (offer?.status === "accepted") {
      const isFree = offer.isFree || offer.priceNGN === 0;
      return (
        <div className="overlay">
          <div className="ov-icon">✅</div>
          <h3>{isFree ? "Extension accepted" : "Payment received"}</h3>
          <p>Waiting for your practitioner to confirm the extension…</p>
        </div>
      );
    }
    // 3. Timer ran out — client can request an extension
    if (complete && !offer && !extRequested && !clientRequested) {
      return (
        <div className="overlay">
          <div className="ov-icon">⏰</div>
          <h3>Session time has ended</h3>
          <p>Would you like to request more time with your practitioner?</p>
          <div className="ov-actions">
            <button className="obtn amber" onClick={() => {
              setExtRequested(true);
              requestExtension(bookingId).catch(() => setExtRequested(false));
            }}>Yes, request more time</button>
            <button className="obtn ghost" onClick={async () => {
              // "No, I'm done" — complete session and return to homepage
              try { await completeSession(bookingId); } catch {}
              window.location.href = "/?session=complete";
            }}>No, I&apos;m done</button>
          </div>
        </div>
      );
    }
    // 4. Client pressed "request more time" but Firestore not yet updated — show immediate feedback
    if ((extRequested || clientRequested) && !offer) {
      return (
        <div className="overlay">
          <div className="ov-icon">⏳</div>
          <h3>More time requested</h3>
          <p>Waiting for {practitionerName} to respond to your request…</p>
        </div>
      );
    }
    return null;
  }
}
