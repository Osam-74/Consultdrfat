"use client";

import Link from "next/link";
import { useState } from "react";

const STEPS = [
  {
    icon: "💬",
    title: "Live Chat",
    desc: "Type messages to Dr. Fat in real time. Your conversation is private and disappears after the session ends.",
    tip: "You can also share images, PDFs, and documents — click the 📎 icon next to the message box.",
  },
  {
    icon: "🎙️",
    title: "Voice Call",
    desc: "Start a voice call by tapping the phone icon at the top right of the chat panel. Your microphone will be requested by the browser.",
    tip: "If Dr. Fat starts a call first, you will see an incoming call prompt. Answer or decline as needed.",
  },
  {
    icon: "⏱️",
    title: "Session Timer",
    desc: "A shared countdown clock shows how much time is remaining in your session. Both you and Dr. Fat see the same timer.",
    tip: "If you need more time, a paid extension offer may appear near the end of your session.",
  },
  {
    icon: "🔔",
    title: "Notify Button",
    desc: "If Dr. Fat has not joined yet, press Notify to send a ping. This lets Dr. Fat know you are in the waiting room.",
    tip: "The button has a short cooldown — press it once and wait for Dr. Fat to respond.",
  },
  {
    icon: "🚪",
    title: "Leaving the Session",
    desc: "Use the Leave button at the top right of the session panel to exit. Dr. Fat will be notified that you left.",
    tip: "You can rejoin before the session expires — use the session link or Your Sessions in your dashboard.",
  },
  {
    icon: "🔒",
    title: "Privacy",
    desc: "Your session is private. Messages, voice, and any shared files are wiped when the session ends.",
    tip: "No recording is made of voice calls. Screenshots are your responsibility.",
  },
];

export default function SessionGuidePage() {
  const [openStep, setOpenStep] = useState<number | null>(null);

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <div className="wrap" style={{ maxWidth: 680, paddingTop: 32, paddingBottom: 64 }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📖</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--navy)", marginBottom: 8 }}>
            Your Session Room Guide
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 15, maxWidth: 440, margin: "0 auto" }}>
            Everything you need to know before your consultation starts — takes 2 minutes.
          </p>
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 40 }}>
          {STEPS.map((step, i) => (
            <div
              key={i}
              onClick={() => setOpenStep(openStep === i ? null : i)}
              style={{
                background: "#fff",
                border: openStep === i ? "1.5px solid var(--teal)" : "1.5px solid var(--line)",
                borderRadius: 16,
                padding: "16px 20px",
                cursor: "pointer",
                transition: "all .2s",
                boxShadow: openStep === i ? "0 4px 18px rgba(14,138,122,.1)" : "var(--shadow-sm)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: openStep === i ? "var(--teal-pale)" : "#f8fafc",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, transition: "all .2s",
                }}>
                  {step.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: "var(--navy)", fontSize: 15 }}>{step.title}</div>
                  {openStep !== i && (
                    <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                      {step.desc.slice(0, 72)}…
                    </div>
                  )}
                </div>
                <svg
                  width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ flexShrink: 0, transition: "transform .2s", transform: openStep === i ? "rotate(180deg)" : "none" }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              {openStep === i && (
                <div style={{ paddingTop: 14, paddingLeft: 58 }}>
                  <p style={{ color: "var(--navy)", fontSize: 14, lineHeight: 1.65, marginBottom: 10 }}>
                    {step.desc}
                  </p>
                  <div style={{
                    background: "var(--teal-pale)", borderRadius: 10, padding: "10px 14px",
                    fontSize: 13, color: "var(--teal-dark)", display: "flex", alignItems: "flex-start", gap: 8,
                  }}>
                    <span style={{ flexShrink: 0 }}>💡</span>
                    <span>{step.tip}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* What to prepare */}
        <div style={{
          background: "linear-gradient(135deg, #0E8A7A 0%, #0B2B4A 100%)",
          borderRadius: 20, padding: "28px 28px", color: "#fff", marginBottom: 32,
        }}>
          <h3 style={{ fontWeight: 800, fontSize: 17, marginBottom: 12 }}>📋 Before You Join</h3>
          <ul style={{ paddingLeft: 18, lineHeight: 2.0, fontSize: 14, margin: 0 }}>
            <li>Have your symptoms written down or in mind</li>
            <li>Gather any relevant test results, prescriptions, or reports</li>
            <li>Find a quiet, private space with stable internet</li>
            <li>Allow microphone access when your browser asks</li>
            <li>Join a few minutes early — the session starts at its scheduled time</li>
          </ul>
        </div>

        {/* CTA */}
        <div style={{ textAlign: "center" }}>
          <Link
            href="/book"
            className="btn btn-primary btn-lg"
            style={{ display: "inline-block" }}
          >
            🩺 Go to My Booking Dashboard
          </Link>
          <p style={{ marginTop: 14, fontSize: 13, color: "var(--muted)" }}>
            Already have an appointment?{" "}
            <Link href="/book" style={{ color: "var(--teal)", fontWeight: 600 }}>
              View your sessions →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
