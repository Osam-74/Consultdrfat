import {
  collection, doc, setDoc, onSnapshot, addDoc, deleteDoc, getDocs,
} from "firebase/firestore";
import { db, API_BASE } from "./firebase";
import { Role } from "./types";

/**
 * Peer-to-peer voice using WebRTC.
 * Firestore is the signaling channel (offer/answer/ICE candidates under `calls/{bookingId}`).
 * Cloudflare provides STUN (free) + TURN (first 1,000 GB/month free) for NAT traversal.
 *
 * AUDIO FIXES applied:
 * - offerToReceiveAudio: true on both offer and answer
 * - remoteAudio element is created externally and passed in for reliable autoplay
 * - ICE candidates buffered until remote description is set (prevents timing race)
 * - Echo cancellation, noise suppression, and auto gain enabled on getUserMedia
 * - Track replacement guard: only add remote track once per track id
 * - Connection state logged for diagnostics
 * - Graceful stop: close PC + stop all local tracks + cleanup Firestore
 */

export async function getIceServers(): Promise<RTCIceServer[]> {
  // Keep to max 4 ICE servers — using 5+ triggers a Chrome console warning
  // and slows down ICE discovery. We combine STUN + a single TURN entry with
  // multiple URL variants (UDP/TCP) in one server object, which Chrome treats
  // as a single server for the count.
  const fallback: RTCIceServer[] = [
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.l.google.com:19302" },
    // OpenRelay TURN — UDP + TCP in one server object (counts as 1 server)
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

export interface VoiceHandle {
  pc: RTCPeerConnection;
  stop: () => Promise<void>;
}

export async function startVoice(opts: {
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
    // Prefer UDP for lower latency; allow TCP as fallback
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  });

  // ── Add local audio tracks ──────────────────────────────────────────────
  localStream.getTracks().forEach((t) => {
    pc.addTrack(t, localStream);
  });

  // ── Handle incoming remote tracks ───────────────────────────────────────
  const remote = new MediaStream();
  pc.ontrack = (e) => {
    // Always prefer e.streams[0]; fall back to e.track
    const tracks =
      e.streams?.[0]?.getTracks().length
        ? e.streams[0].getTracks()
        : [e.track];

    tracks.forEach((t) => {
      if (!remote.getTrackById(t.id)) remote.addTrack(t);
    });
    onRemote(remote);
  };

  // ── Connection state logging ────────────────────────────────────────────
  let restartAttempted = false;
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    console.log("[WebRTC] connection:", s);
    if (onState) onState(s);
    if (s === "failed") {
      console.warn("[WebRTC] connection failed — attempting ICE restart...");
      if (!restartAttempted && pc.currentLocalDescription) {
        restartAttempted = true;
        try {
          if (caller) {
            pc.createOffer({ iceRestart: true, offerToReceiveAudio: true })
              .then((offer) => pc.setLocalDescription(offer))
              .then(() => setDoc(callRef, { offer: { type: pc.localDescription!.type, sdp: pc.localDescription!.sdp } }))
              .catch((e) => console.warn("[WebRTC] ICE restart failed:", e));
          }
        } catch (e) { console.warn("[WebRTC] ICE restart error:", e); }
      }
    }
  };
  pc.onicegatheringstatechange = () =>
    console.log("[WebRTC] ICE gathering:", pc.iceGatheringState);
  pc.oniceconnectionstatechange = () =>
    console.log("[WebRTC] ICE connection:", pc.iceConnectionState);

  // ── Firestore refs ───────────────────────────────────────────────────────
  const callRef       = doc(db, "calls", bookingId);
  const offerCands    = collection(callRef, "offerCandidates");
  const answerCands   = collection(callRef, "answerCandidates");
  const unsubs: Array<() => void> = [];

  // Buffer ICE candidates that arrive before remote description is set
  const pendingCandidates: RTCIceCandidate[] = [];
  const drainPending = async () => {
    while (pendingCandidates.length) {
      const c = pendingCandidates.shift()!;
      try { await pc.addIceCandidate(c); } catch (err) {
        console.warn("[WebRTC] addIceCandidate error:", err);
      }
    }
  };

  const caller = role === "practitioner"; // practitioner creates the offer

  if (caller) {
    // ── CALLER (practitioner) ──────────────────────────────────────────────
    pc.onicecandidate = (e) => {
      if (e.candidate) void addDoc(offerCands, e.candidate.toJSON());
    };

    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    await setDoc(callRef, { offer: { type: offer.type, sdp: offer.sdp } });

    // Wait for answer
    unsubs.push(
      onSnapshot(callRef, async (snap) => {
        const data = snap.data() as { answer?: RTCSessionDescriptionInit } | undefined;
        if (!pc.currentRemoteDescription && data?.answer) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          await drainPending();
        }
      })
    );

    // Collect remote ICE candidates
    unsubs.push(
      onSnapshot(answerCands, (snap) => {
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

  } else {
    // ── CALLEE (client) ────────────────────────────────────────────────────
    pc.onicecandidate = (e) => {
      if (e.candidate) void addDoc(answerCands, e.candidate.toJSON());
    };

    unsubs.push(
      onSnapshot(callRef, async (snap) => {
        const data = snap.data() as { offer?: RTCSessionDescriptionInit; answer?: RTCSessionDescriptionInit } | undefined;
        if (data?.offer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await pc.createAnswer({ offerToReceiveAudio: true });
          await pc.setLocalDescription(answer);
          await setDoc(callRef, { answer: { type: answer.type, sdp: answer.sdp } }, { merge: true });
          await drainPending();
        }
      })
    );

    unsubs.push(
      onSnapshot(offerCands, (snap) => {
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
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────
  const stop = async () => {
    unsubs.forEach((u) => u());
    // Stop all local tracks
    localStream.getTracks().forEach((t) => t.stop());
    pc.getSenders().forEach((s) => s.track?.stop());
    pc.close();
    // Caller cleans up Firestore signaling docs
    if (caller) {
      try {
        const [ocs, acs] = await Promise.all([getDocs(offerCands), getDocs(answerCands)]);
        await Promise.all([
          ...ocs.docs.map((d) => deleteDoc(d.ref)),
          ...acs.docs.map((d) => deleteDoc(d.ref)),
          deleteDoc(callRef),
        ]);
      } catch {
        /* best-effort — non-fatal */
      }
    }
  };

  return { pc, stop };
}

/**
 * Request microphone access with audio-quality constraints.
 * Call this before startVoice. Returns the stream to pass as localStream.
 * Throws if the user denies mic permission.
 */
export async function getMicStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl:  true,
      sampleRate:       { ideal: 48000 },
      channelCount:     { ideal: 1 }, // mono is fine for voice
    },
    video: false,
  });
}
