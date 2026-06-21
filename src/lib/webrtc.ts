import {
  collection, doc, setDoc, onSnapshot, addDoc, deleteDoc, getDocs,
  updateDoc,
} from "firebase/firestore";
import { db, API_BASE } from "./firebase";
import { Role } from "./types";

/**
 * Peer-to-peer voice using WebRTC with a call/answer model.
 *
 * Call flow:
 * 1. One party clicks "Call" → creates offer + sets callStatus to "ringing"
 * 2. Other party sees incoming call → clicks "Answer" → creates answer
 * 3. Once connected, callStatus = "connected"
 * 4. Either party can "End Call" → callStatus = "ended", PC torn down
 *
 * ICE restart: on "failed" state, up to 3 restart attempts.
 * TURN: uses Cloudflare TURN (from worker /turn endpoint) with OpenRelay fallback.
 */

export async function getIceServers(): Promise<RTCIceServer[]> {
  const fallback: RTCIceServer[] = [
    { urls: "stun:stun.cloudflare.com:3478" },
    // OpenRelay TURN — single server object with multiple URL variants
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ];
  if (!API_BASE) return fallback;
  try {
    const r = await fetch(`${API_BASE}/turn`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return fallback;
    const data = (await r.json()) as { iceServers?: RTCIceServer[] };
    return data.iceServers?.length ? data.iceServers : fallback;
  } catch {
    return fallback;
  }
}

export type CallStatus = "idle" | "ringing" | "connected" | "ended" | "missed" | "declined";

export interface CallState {
  status: CallStatus;
  caller: Role | null;       // who initiated the call
  offer?: { type: RTCSdpType; sdp: string };
  answer?: { type: RTCSdpType; sdp: string };
  startedAt?: number;
}

export interface VoiceHandle {
  pc: RTCPeerConnection;
  stop: () => Promise<void>;
  getStats: () => Promise<RTCStatsReport | null>;
}

const callRef = (bookingId: string) => doc(db, "calls", bookingId);
const offerCandsRef = (bookingId: string) => collection(callRef(bookingId), "offerCandidates");
const answerCandsRef = (bookingId: string) => collection(callRef(bookingId), "answerCandidates");

/** Watch the call state for a booking (ringing, connected, ended, etc.) */
export function watchCallState(bookingId: string, cb: (state: CallState) => void): () => void {
  return onSnapshot(callRef(bookingId), (snap) => {
    const data = snap.data() as CallState | undefined;
    if (!data) {
      cb({ status: "idle", caller: null });
      return;
    }
    cb(data);
  }, () => {
    cb({ status: "idle", caller: null });
  });
}

/** Initiate a call — creates the WebRTC offer and sets status to "ringing" */
export async function initiateCall(opts: {
  bookingId: string;
  role: Role;
  localStream: MediaStream;
  onRemote: (stream: MediaStream) => void;
  onState?: (s: RTCPeerConnectionState) => void;
}): Promise<VoiceHandle> {
  const { bookingId, role, localStream, onRemote, onState } = opts;
  const iceServers = await getIceServers();
  const pc = new RTCPeerConnection({
    iceServers,
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  });

  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

  const remote = new MediaStream();
  pc.ontrack = (e) => {
    const tracks = e.streams?.[0]?.getTracks().length ? e.streams[0].getTracks() : [e.track];
    tracks.forEach((t) => { if (!remote.getTrackById(t.id)) remote.addTrack(t); });
    onRemote(remote);
  };

  // Connection state monitoring with auto-retry
  let restartCount = 0;
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    console.log("[WebRTC] connection:", s);
    if (onState) onState(s);
    if (s === "failed" && restartCount < 3) {
      restartCount++;
      console.warn(`[WebRTC] connection failed — ICE restart #${restartCount}`);
      attemptIceRestart(pc, bookingId, role);
    }
  };

  let iceDisconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let iceRestartCount = 0;
  pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState;
    console.log("[WebRTC] ICE:", state);
    if (iceDisconnectTimer) { clearTimeout(iceDisconnectTimer); iceDisconnectTimer = null; }
    if (state === "disconnected") {
      iceDisconnectTimer = setTimeout(() => {
        if (pc.iceConnectionState === "disconnected" && iceRestartCount < 3) {
          iceRestartCount++;
          console.warn(`[WebRTC] ICE disconnected >10s — restart #${iceRestartCount}`);
          attemptIceRestart(pc, bookingId, role);
        }
      }, 10_000);
    }
    if (state === "connected" || state === "completed") {
      iceRestartCount = 0;
      restartCount = 0;
    }
  };

  // ICE candidate handling
  pc.onicecandidate = (e) => {
    if (e.candidate) void addDoc(offerCandsRef(bookingId), e.candidate.toJSON());
  };

  // Create offer
  const offer = await pc.createOffer({ offerToReceiveAudio: true });
  await pc.setLocalDescription(offer);
  await setDoc(callRef(bookingId), {
    status: "ringing",
    caller: role,
    offer: { type: offer.type, sdp: offer.sdp },
    startedAt: Date.now(),
  });

  const unsubs: Array<() => void> = [];
  const pendingCandidates: RTCIceCandidate[] = [];

  // Wait for answer
  unsubs.push(
    onSnapshot(callRef(bookingId), async (snap) => {
      const data = snap.data() as CallState | undefined;
      if (!pc.currentRemoteDescription && data?.answer) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer as RTCSessionDescriptionInit));
        while (pendingCandidates.length) {
          const c = pendingCandidates.shift()!;
          try { await pc.addIceCandidate(c); } catch {}
        }
        // Update status to connected
        if (data.status !== "connected") {
          await updateDoc(callRef(bookingId), { status: "connected" });
        }
      }
    })
  );

  // Collect answer ICE candidates
  unsubs.push(
    onSnapshot(answerCandsRef(bookingId), (snap) => {
      snap.docChanges().forEach(async (c) => {
        if (c.type !== "added") return;
        const candidate = new RTCIceCandidate(c.doc.data());
        if (pc.remoteDescription) {
          try { await pc.addIceCandidate(candidate); } catch {}
        } else {
          pendingCandidates.push(candidate);
        }
      });
    })
  );

  const stop = async () => {
    unsubs.forEach((u) => u());
    localStream.getTracks().forEach((t) => t.stop());
    pc.getSenders().forEach((s) => s.track?.stop());
    pc.close();
    try {
      await setDoc(callRef(bookingId), { status: "ended", caller: role }, { merge: true });
      // Clean up ICE candidate collections
      const [ocs, acs] = await Promise.all([getDocs(offerCandsRef(bookingId)), getDocs(answerCandsRef(bookingId))]);
      await Promise.all([
        ...ocs.docs.map((d) => deleteDoc(d.ref)),
        ...acs.docs.map((d) => deleteDoc(d.ref)),
      ]);
    } catch { /* non-fatal */ }
  };

  return { pc, stop, getStats: () => pc.getStats().catch(() => null) };
}

/** Answer an incoming call — creates the WebRTC answer */
export async function answerCall(opts: {
  bookingId: string;
  role: Role;
  localStream: MediaStream;
  onRemote: (stream: MediaStream) => void;
  onState?: (s: RTCPeerConnectionState) => void;
}): Promise<VoiceHandle> {
  const { bookingId, role, localStream, onRemote, onState } = opts;
  const iceServers = await getIceServers();
  const pc = new RTCPeerConnection({
    iceServers,
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  });

  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

  const remote = new MediaStream();
  pc.ontrack = (e) => {
    const tracks = e.streams?.[0]?.getTracks().length ? e.streams[0].getTracks() : [e.track];
    tracks.forEach((t) => { if (!remote.getTrackById(t.id)) remote.addTrack(t); });
    onRemote(remote);
  };

  let restartCount = 0;
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    console.log("[WebRTC] connection:", s);
    if (onState) onState(s);
    if (s === "failed" && restartCount < 3) {
      restartCount++;
      console.warn(`[WebRTC] connection failed — waiting for caller restart #${restartCount}`);
    }
  };

  let iceDisconnectTimer: ReturnType<typeof setTimeout> | null = null;
  pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState;
    console.log("[WebRTC] ICE:", state);
    if (iceDisconnectTimer) { clearTimeout(iceDisconnectTimer); iceDisconnectTimer = null; }
    if (state === "disconnected") {
      iceDisconnectTimer = setTimeout(() => {
        console.warn("[WebRTC] ICE disconnected >10s — waiting for caller restart");
      }, 10_000);
    }
    if (state === "connected" || state === "completed") {
      restartCount = 0;
    }
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) void addDoc(answerCandsRef(bookingId), e.candidate.toJSON());
  };

  const unsubs: Array<() => void> = [];
  const pendingCandidates: RTCIceCandidate[] = [];

  // Listen for offer
  unsubs.push(
    onSnapshot(callRef(bookingId), async (snap) => {
      const data = snap.data() as CallState | undefined;
      if (data?.offer && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer as RTCSessionDescriptionInit));
        const answer = await pc.createAnswer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(answer);
        await setDoc(callRef(bookingId), {
          answer: { type: answer.type, sdp: answer.sdp },
          status: "connected",
        }, { merge: true });
        while (pendingCandidates.length) {
          const c = pendingCandidates.shift()!;
          try { await pc.addIceCandidate(c); } catch {}
        }
      }
      // Handle call ended by other party
      if (data?.status === "ended") {
        console.log("[WebRTC] Call ended by other party");
      }
    })
  );

  // Collect offer ICE candidates
  unsubs.push(
    onSnapshot(offerCandsRef(bookingId), (snap) => {
      snap.docChanges().forEach(async (c) => {
        if (c.type !== "added") return;
        const candidate = new RTCIceCandidate(c.doc.data());
        if (pc.remoteDescription) {
          try { await pc.addIceCandidate(candidate); } catch {}
        } else {
          pendingCandidates.push(candidate);
        }
      });
    })
  );

  const stop = async () => {
    unsubs.forEach((u) => u());
    localStream.getTracks().forEach((t) => t.stop());
    pc.getSenders().forEach((s) => s.track?.stop());
    pc.close();
    try {
      await setDoc(callRef(bookingId), { status: "ended", caller: role }, { merge: true });
      const [ocs, acs] = await Promise.all([getDocs(offerCandsRef(bookingId)), getDocs(answerCandsRef(bookingId))]);
      await Promise.all([
        ...ocs.docs.map((d) => deleteDoc(d.ref)),
        ...acs.docs.map((d) => deleteDoc(d.ref)),
      ]);
    } catch { /* non-fatal */ }
  };

  return { pc, stop, getStats: () => pc.getStats().catch(() => null) };
}

/** Decline an incoming call */
export async function declineCall(bookingId: string, role: Role): Promise<void> {
  try {
    await setDoc(callRef(bookingId), { status: "declined", caller: role }, { merge: true });
  } catch { /* non-fatal */ }
}

/** End an active call (sets status to "ended") */
export async function endCall(bookingId: string, role: Role): Promise<void> {
  try {
    await setDoc(callRef(bookingId), { status: "ended", caller: role }, { merge: true });
  } catch { /* non-fatal */ }
}

/** Helper: ICE restart for caller */
async function attemptIceRestart(pc: RTCPeerConnection, bookingId: string, role: Role) {
  try {
    if (role === "practitioner" && pc.currentLocalDescription) {
      const offer = await pc.createOffer({ iceRestart: true, offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      await setDoc(callRef(bookingId), {
        offer: { type: offer.type, sdp: offer.sdp },
      }, { merge: true });
    }
  } catch (e) {
    console.warn("[WebRTC] ICE restart error:", e);
  }
}

/** Request microphone access with audio-quality constraints */
export async function getMicStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl:  true,
      sampleRate:       { ideal: 48000 },
      channelCount:     { ideal: 1 },
    },
    video: false,
  });
}

// ── Legacy support: keep startVoice for backward compatibility ──
export async function startVoice(opts: {
  bookingId: string;
  role: Role;
  localStream: MediaStream;
  onRemote: (stream: MediaStream) => void;
  onState?: (s: RTCPeerConnectionState) => void;
}): Promise<VoiceHandle> {
  // Delegate to initiateCall for practitioner, answerCall for client
  if (opts.role === "practitioner") {
    return initiateCall(opts);
  } else {
    return answerCall(opts);
  }
}
