import {
  collection, doc, setDoc, onSnapshot, addDoc, deleteDoc, getDocs,
} from "firebase/firestore";
import { db, API_BASE } from "./firebase";
import { Role } from "./types";

/**
 * Peer-to-peer voice using WebRTC. Firestore is the signaling channel (offer /
 * answer / ICE candidates live under `calls/{bookingId}`), and Cloudflare
 * provides STUN (free, unlimited) + TURN (first 1,000 GB/month free) for NAT
 * traversal on mobile networks. No separate signaling server is needed.
 */

export async function getIceServers(): Promise<RTCIceServer[]> {
  const fallback: RTCIceServer[] = [
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.l.google.com:19302" },
  ];
  if (!API_BASE) return fallback;
  try {
    const r = await fetch(`${API_BASE}/turn`);
    if (!r.ok) return fallback;
    const data = (await r.json()) as { iceServers?: RTCIceServer[] };
    return data.iceServers ?? fallback;
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
  const pc = new RTCPeerConnection({ iceServers: await getIceServers() });

  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
  const remote = new MediaStream();
  pc.ontrack = (e) => {
    e.streams[0].getTracks().forEach((t) => remote.addTrack(t));
    onRemote(remote);
  };
  if (onState) pc.onconnectionstatechange = () => onState(pc.connectionState);

  const callRef = doc(db, "calls", bookingId);
  const offerCands = collection(callRef, "offerCandidates");
  const answerCands = collection(callRef, "answerCandidates");
  const unsubs: Array<() => void> = [];
  const caller = role === "practitioner"; // practitioner initiates the offer

  if (caller) {
    pc.onicecandidate = (e) => {
      if (e.candidate) void addDoc(offerCands, e.candidate.toJSON());
    };
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    await setDoc(callRef, { offer: { type: offer.type, sdp: offer.sdp } });

    unsubs.push(
      onSnapshot(callRef, async (snap) => {
        const data = snap.data() as { answer?: RTCSessionDescriptionInit } | undefined;
        if (!pc.currentRemoteDescription && data?.answer) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
      })
    );
    unsubs.push(
      onSnapshot(answerCands, (snap) => {
        snap.docChanges().forEach((c) => {
          if (c.type === "added") void pc.addIceCandidate(new RTCIceCandidate(c.doc.data()));
        });
      })
    );
  } else {
    pc.onicecandidate = (e) => {
      if (e.candidate) void addDoc(answerCands, e.candidate.toJSON());
    };
    unsubs.push(
      onSnapshot(callRef, async (snap) => {
        const data = snap.data() as { offer?: RTCSessionDescriptionInit } | undefined;
        if (data?.offer && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await setDoc(callRef, { answer: { type: answer.type, sdp: answer.sdp } }, { merge: true });
        }
      })
    );
    unsubs.push(
      onSnapshot(offerCands, (snap) => {
        snap.docChanges().forEach((c) => {
          if (c.type === "added") void pc.addIceCandidate(new RTCIceCandidate(c.doc.data()));
        });
      })
    );
  }

  const stop = async () => {
    unsubs.forEach((u) => u());
    pc.getSenders().forEach((s) => s.track?.stop());
    pc.close();
    if (caller) {
      try {
        for (const d of (await getDocs(offerCands)).docs) await deleteDoc(d.ref);
        for (const d of (await getDocs(answerCands)).docs) await deleteDoc(d.ref);
        await deleteDoc(callRef);
      } catch {
        /* best-effort cleanup */
      }
    }
  };

  return { pc, stop };
}
