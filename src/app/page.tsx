"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";

// Reusable dropdown link
function DropdownLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <a href={href} onClick={onClick}
      style={{ display: "block", padding: "12px 18px", fontSize: 13, color: "var(--navy)", textDecoration: "none", fontWeight: 600, cursor: "pointer" }}
      onMouseOver={e => (e.currentTarget.style.background="#f8fafc")}
      onMouseOut={e => (e.currentTarget.style.background="transparent")}
    >{children}</a>
  );
}


// ── Testimonials data ──────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    quote: "Dr. Fat was incredibly patient and thorough. He explained my diagnosis in plain terms I could actually understand. I felt genuinely cared for.",
    name: "Adaeze Nwosu", initial: "A", location: "Enugu, Enugu State",
  },
  {
    quote: "I was skeptical about online consultations but this completely changed my mind. Quick, private, and very professional. I saved hours I would have wasted in traffic.",
    name: "Babatunde Ojo", initial: "B", location: "Ikeja, Lagos State",
  },
  {
    quote: "Got my test results reviewed and a clear treatment plan within 30 minutes. The chat feature was really helpful for sharing my documents.",
    name: "Chisom Eze", initial: "C", location: "Onitsha, Anambra State",
  },
  {
    quote: "My child had a fever at 11pm. Being able to consult a real doctor from home at that hour was a lifesaver. Highly recommended.",
    name: "Folake Adeyemi", initial: "F", location: "Ibadan, Oyo State",
  },
  {
    quote: "I manage hypertension and Dr. Fat helped me understand my medications much better. I now have a proper plan to follow. Thank you.",
    name: "Emeka Okafor", initial: "E", location: "Port Harcourt, Rivers State",
  },
  {
    quote: "Very discreet and professional. I had a sensitive health concern I was too embarrassed to discuss in a regular clinic. This was perfect.",
    name: "Ngozi Uche", initial: "N", location: "Abuja, FCT",
  },
];

function TestimonialsSection() {
  const [active, setActive] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [prevActive, setPrevActive] = useState(-1);

  // Auto-slide every 5 seconds
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setActive(a => {
        setPrevActive(a);
        return (a + 1) % TESTIMONIALS.length;
      });
    }, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const goTo = (i: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPrevActive(active);
    setActive(i);
    timerRef.current = setInterval(() => {
      setActive(a => {
        setPrevActive(a);
        return (a + 1) % TESTIMONIALS.length;
      });
    }, 5000);
  };

  const t = TESTIMONIALS[active];

  return (
    <section className="section" style={{ background: "var(--paper)", overflow: "hidden" }}>
      <div className="wrap">
        <div className="section-head">
          <div className="section-label">Voices From The Consultation Room</div>
          <h2>Patients who chose to consult differently.</h2>
        </div>
        <div className="testi-carousel">
          <div className="testi-card" key={active}>
            {/* 5 stars */}
            <div className="testi-stars">{"★".repeat(5)}</div>
            {/* Quote */}
            <blockquote className="testi-quote">&ldquo;{t.quote}&rdquo;</blockquote>
            {/* Profile */}
            <div className="testi-profile">
              <div className="testi-avatar">{t.initial}</div>
              <div>
                <div className="testi-name">{t.name}</div>
                <div className="testi-location">{t.location}</div>
              </div>
            </div>
          </div>
          {/* Carousel indicators */}
          <div className="testi-dots">
            {TESTIMONIALS.map((_, i) => (
              <button
                key={i}
                className={"testi-dot" + (i === active ? " active" : "")}
                onClick={() => goTo(i)}
                aria-label={`View testimonial ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── FAQ data ───────────────────────────────────────────────────────────────
const FAQS = [
  {
    q: "How does the online consultation actually work?",
    a: "Once you book and pay, you receive a session link. At your appointment time, you join a private room where you can speak with Dr. Fat via voice call and live chat. Everything is encrypted and wiped after the session ends.",
  },
  {
    q: "Is this a real medical consultation or just generic advice?",
    a: "This is a real, personalised medical consultation with a qualified MDCN-registered doctor. Dr. Fat reviews your specific symptoms and history, not just generic health tips.",
  },
  {
    q: "What happens if I miss my appointment?",
    a: "Missed appointments are marked as No-Show and the session fee is not refunded. You can book a new slot at any time. If you know you'll be late, use the Notify button inside the waiting room to inform Dr. Fat.",
  },
  {
    q: "Can Dr. Fat prescribe medications?",
    a: "Yes. Dr. Fat can issue prescriptions, recommend over-the-counter treatments, and provide referral letters where needed — all delivered digitally after your session.",
  },
  {
    q: "Is my health information kept private?",
    a: "Absolutely. All session data — chat, voice, and shared files — is deleted once the session ends. Nothing is shared with third parties. Your privacy is our top priority.",
  },
  {
    q: "What if I get disconnected during my session?",
    a: "Do not worry. You can return to your session room using the floating chat icon on any page, or via 'Your Sessions' in your dashboard. Your session timer continues running so rejoin as quickly as possible.",
  },
];

function FAQSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="section" style={{ background: "#F0FAF9" }}>
      <div className="wrap" style={{ maxWidth: 720 }}>
        <div className="section-head">
          <div className="section-label">FAQ</div>
          <h2>Questions, Answered</h2>
        </div>
        <div className="faq-list">
          {FAQS.map((item, i) => (
            <div
              key={i}
              className={"faq-item" + (open === i ? " open" : "")}
              onClick={() => setOpen(open === i ? null : i)}
            >
              <div className="faq-q">
                <span>{item.q}</span>
                <svg
                  className="faq-chevron"
                  width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              {open === i && (
                <div className="faq-a">{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
export default function Home() {
  const { user, role, signOut } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);



  return (
    <>
      {/* ── HERO ── */}
      <section className="hero">
        <div className="wrap">
          <nav className="nav">
            <Link href="/" className="brand">
              <div className="brand-icon">🩺</div>
              <div className="brand-text">
                <span style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>ConsultDrFat</span>
                <small style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,.55)", letterSpacing: "0.05em", textTransform: "uppercase", marginTop: 2, display: "block" }}>Medical Consultations</small>
              </div>
            </Link>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {user ? (
                <div ref={profileRef} style={{ position: "relative" }}>
                  <button
                    onClick={() => setProfileOpen(v => !v)}
                    style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "rgba(255,255,255,.18)", border: "2px solid rgba(255,255,255,.35)",
                      color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      letterSpacing: "-.01em",
                    }}
                    title={user.displayName ?? user.email ?? "Account"}
                    aria-label="Account menu"
                  >
                    {user.displayName?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? "A"}
                  </button>

                  {profileOpen && (
                    <div style={{
                      position: "fixed",
                      top: 64,
                      right: 16,
                      background: "#fff",
                      borderRadius: 14,
                      boxShadow: "0 12px 40px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.10)",
                      minWidth: 200,
                      zIndex: 99999,
                      overflow: "hidden",
                    }}>
                      {/* Header */}
                      <div style={{ padding: "14px 18px", borderBottom: "1px solid #f0f0f0", background: "#fafbfc" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {user.displayName ?? (role === "practitioner" ? "Dr. Fat" : "My Account")}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
                        {role === "practitioner" && (
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--teal)", marginTop: 4, textTransform: "uppercase", letterSpacing: ".04em" }}>Practitioner</div>
                        )}
                      </div>

                      {/* Role-aware menu items */}
                      {role === "practitioner" ? (
                        <>
                          <DropdownLink href="/p-dfta" onClick={() => setProfileOpen(false)}>Dashboard</DropdownLink>
                          <DropdownLink href="/waiting-room" onClick={() => setProfileOpen(false)}>Waiting Room</DropdownLink>
                        </>
                      ) : (
                        <>
                          <DropdownLink href="/book/" onClick={() => setProfileOpen(false)}>Book a Session</DropdownLink>
                        </>
                      )}

                      <button
                        onClick={() => { setProfileOpen(false); signOut(); }}
                        style={{
                          width: "100%", textAlign: "left", padding: "12px 18px",
                          fontSize: 13, color: "#e53e3e", fontWeight: 600,
                          background: "none", border: "none", cursor: "pointer",
                          borderTop: "1px solid #f0f0f0",
                        }}
                        onMouseOver={e => (e.currentTarget.style.background="#fff5f5")}
                        onMouseOut={e => (e.currentTarget.style.background="transparent")}
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link href="/book/" className="btn btn-primary btn-sm">Book Now</Link>
              )}
            </div>
          </nav>
          <div className="hero-grid">
            <div className="hero-left">
              <div className="hero-badge">
                <span className="hero-badge-dot" />
                Board-Certified Medical Doctor
              </div>
              <h1>
                Expert Medical Care,<br/>
                <em>From the Comfort of Home.</em>
              </h1>
              <p>
                Book a private one-on-one medical consultation with Dr. Fat — a qualified, 
                experienced physician. Get professional advice, prescriptions, and follow-up 
                care. Pay in naira. No queues.
              </p>
              <div className="hero-btns">
                <Link href="/book/" className="btn btn-primary btn-lg">
                  📅 Book a Consultation
                </Link>
                <a href="#how" className="btn btn-ghost-white btn-lg">
                  How it works
                </a>
              </div>
              <div className="hero-trust">
                <span className="hero-trust-item">
                  <span className="hero-trust-icon">🔒</span>
                  End-to-end encrypted
                </span>
                <span className="hero-trust-item">
                  <span className="hero-trust-icon">💳</span>
                  Pay securely in ₦
                </span>
                <span className="hero-trust-item">
                  <span className="hero-trust-icon">⏱</span>
                  30-min sessions
                </span>
                <span className="hero-trust-item">
                  <span className="hero-trust-icon">🏥</span>
                  MDCN registered
                </span>
              </div>
            </div>

            <div className="hero-card">
              <div className="hero-card-header">
                <div className="hero-card-avatar">👨‍⚕️</div>
                <div className="hero-card-info">
                  <h4>Dr. Fat</h4>
                  <p>General Practitioner & Telemedicine Specialist</p>
                </div>
              </div>
              <div className="hero-card-stats">
                <div className="stat-box">
                  <div className="stat-val">8+</div>
                  <div className="stat-lbl">Years Practice</div>
                </div>
                <div className="stat-box">
                  <div className="stat-val">500+</div>
                  <div className="stat-lbl">Patients Seen</div>
                </div>
                <div className="stat-box">
                  <div className="stat-val">4.9★</div>
                  <div className="stat-lbl">Rating</div>
                </div>
              </div>
              <div className="hero-card-slots">
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.45)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Available This Week
                </div>
                <div className="slot-preview">
                  <span>🗓 Mon, Jun 16 · 9:00 AM</span>
                  <span className="slot-available">Open</span>
                </div>
                <div className="slot-preview">
                  <span>🗓 Tue, Jun 17 · 10:30 AM</span>
                  <span className="slot-available">Open</span>
                </div>
                <div className="slot-preview">
                  <span>🗓 Wed, Jun 18 · 2:00 PM</span>
                  <span className="slot-available">Open</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="section" id="how">
        <div className="wrap">
          <div className="section-head">
            <div className="section-label">How It Works</div>
            <h2>Your consultation in three simple steps.</h2>
            <p>
              From booking to your session — simple, private, and professional. 
              No waiting rooms, no hassle.
            </p>
          </div>
          <div className="hiw-list">
            <div className="hiw-row">
              <div className="hiw-num">01</div>
              <div className="hiw-content">
                <div className="hiw-icon">📅</div>
                <div>
                  <h3 className="hiw-title">Choose Your Slot</h3>
                  <p className="hiw-desc">Browse available times for the next two weeks. Pick a slot that works — mornings, afternoons, or evenings.</p>
                </div>
              </div>
            </div>
            <div className="hiw-row">
              <div className="hiw-num">02</div>
              <div className="hiw-content">
                <div className="hiw-icon">💳</div>
                <div>
                  <h3 className="hiw-title">Pay Securely</h3>
                  <p className="hiw-desc">Pay in naira using your bank card, bank transfer, or mobile money. Your slot is confirmed immediately after payment.</p>
                </div>
              </div>
            </div>
            <div className="hiw-row">
              <div className="hiw-num">03</div>
              <div className="hiw-content">
                <div className="hiw-icon">🩺</div>
                <div>
                  <h3 className="hiw-title">Consult Dr. Fat</h3>
                  <p className="hiw-desc">Join your private room — voice call, live chat, and a shared countdown timer. Get your diagnosis, advice, and next steps.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MEET DR. FAT — Teaser card ── */}
      <section className="section" style={{ paddingTop: 0 }} id="meet">
        <div className="wrap">
          <div className="section-head">
            <div className="section-label">Your Doctor</div>
            <h2>Know who you&apos;re speaking with.</h2>
            <p>
              We believe you deserve to know your doctor before booking. 
              Meet Dr. Fat — his background, qualifications, and what he specialises in.
            </p>
          </div>
          <div className="meet-teaser">
            <div className="meet-teaser-avatar">👨‍⚕️</div>
            <div className="meet-teaser-body">
              <h3>Dr. Fat — MBBS, MDCN Registered</h3>
              <p>
                8+ years of clinical experience in general practice, chronic disease management, 
                and telemedicine. Serving patients across Nigeria with compassionate, focused care.
              </p>
              <div className="meet-teaser-tags">
                <span className="meet-teaser-tag">🏥 General Practice</span>
                <span className="meet-teaser-tag">🧠 Mental Wellness</span>
                <span className="meet-teaser-tag">💊 Chronic Care</span>
                <span className="meet-teaser-tag">🌿 Preventive Medicine</span>
              </div>
            </div>
            <div style={{ flexShrink: 0 }}>
              <Link href="/meet/" className="btn btn-primary">
                Meet Dr. Fat →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHY CONSULT DR. FAT ── */}
      <section className="section" style={{ background: "var(--teal-pale)", paddingTop: 0, marginTop: 0 }} id="why">
        <div className="wrap">
          <div className="section-head" style={{ paddingTop: 72 }}>
            <div className="section-label">Why Choose Us</div>
            <h2>Medicine you can trust, care you can feel.</h2>
            <p>
              ConsultDrFat was built for Nigerians who deserve quality medical 
              attention without traffic, queues, and long waits.
            </p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon-box fi-teal">🔐</div>
              <div>
                <h4>Fully Private &amp; Confidential</h4>
                <p>
                  All sessions are encrypted end-to-end. Your health information 
                  stays between you and Dr. Fat — never shared, never stored beyond your session.
                </p>
              </div>
            </div>
            <div className="feature-card">
              <div className="feature-icon-box fi-sky">🩺</div>
              <div>
                <h4>Qualified &amp; Experienced Doctor</h4>
                <p>
                  Dr. Fat is a fully registered medical practitioner with over 8 years 
                  of clinical experience in general practice and chronic disease management.
                </p>
              </div>
            </div>
            <div className="feature-card">
              <div className="feature-icon-box fi-gold">⏱</div>
              <div>
                <h4>Focused 30-Minute Sessions</h4>
                <p>
                  No rushed 5-minute slots. 30 minutes of dedicated one-on-one time. 
                  Need more? Extend your session mid-consultation.
                </p>
              </div>
            </div>
            <div className="feature-card">
              <div className="feature-icon-box fi-navy">🇳🇬</div>
              <div>
                <h4>Built for Nigeria</h4>
                <p>
                  Pay via card, bank transfer, OPay, or PalmPay — methods Nigerians 
                  use every day. Optimised for local internet speeds.
                </p>
              </div>
            </div>
            <div className="feature-card">
              <div className="feature-icon-box fi-teal">💬</div>
              <div>
                <h4>Voice + Chat in One Room</h4>
                <p>
                  Speak by voice or use live chat. Both sides see the same shared countdown 
                  so time is never wasted.
                </p>
              </div>
            </div>
            <div className="feature-card">
              <div className="feature-icon-box fi-sky">📋</div>
              <div>
                <h4>Digital Notes &amp; Referrals</h4>
                <p>
                  After your session, receive a typed summary — recommendations, 
                  prescriptions, or referrals — sent directly to your email.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CONDITIONS ── */}
      <section className="section" id="areas">
        <div className="wrap">
          <div className="section-head">
            <div className="section-label">Areas of Practice</div>
            <h2>Conditions we can help with.</h2>
            <p>
              Whether it&apos;s a nagging concern or an urgent question — Dr. Fat 
              handles a broad range of everyday medical needs.
            </p>
          </div>
          <div className="conditions-grid">
            {[
              { icon: "🤒", title: "Fever & Infections", desc: "Malaria, typhoid, chest infections, UTIs and general illness" },
              { icon: "💊", title: "Chronic Conditions", desc: "Diabetes, hypertension, asthma — monitoring & management" },
              { icon: "🧠", title: "Mental Wellness", desc: "Stress, anxiety, sleep problems, low mood — compassionate support" },
              { icon: "🍽", title: "Nutrition & Lifestyle", desc: "Weight management, dietary guidance, healthy living plans" },
              { icon: "👶", title: "Child Health", desc: "Paediatric questions, vaccinations, growth & development" },
              { icon: "🩸", title: "Lab Result Review", desc: "Interpret your blood work, scans, and test results clearly" },
            ].map((c) => (
              <div className="card" key={c.title} style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
                <div style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{c.icon}</div>
                <div>
                  <h4 style={{ fontSize: 14.5, marginBottom: 4, fontFamily: "var(--font-pjs), sans-serif" }}>{c.title}</h4>
                  <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <TestimonialsSection />

      {/* ── FAQ ── */}
      <FAQSection />

      {/* ── CTA ── */}
      <section className="section-sm">
        <div className="wrap">
          <div className="cta-band">
            <h2>Ready to speak with Dr. Fat?</h2>
            <p>
              Book your session today — available appointments for the next 14 days.<br/>
              Secure, private, and professional, from wherever you are in Nigeria.
            </p>
            <Link href="/book/" className="btn btn-primary btn-lg">
              📅 Book Your Consultation
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER — no practitioner link ── */}
      <footer className="footer">
        <div className="wrap">
          <div className="footer-inner">
            <div className="footer-brand">
              <div className="brand" style={{ marginBottom: 4 }}>
                <div className="brand-icon">🩺</div>
                <div className="brand-text">
                  <span style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>ConsultDrFat</span>
                  <small style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,.45)", letterSpacing: "0.05em", textTransform: "uppercase", marginTop: 2, display: "block" }}>Medical Consultations</small>
                </div>
              </div>
              <p>
                Private, secure medical consultations with a qualified Nigerian doctor. 
                Pay in naira. Available 6 days a week.
              </p>
            </div>
            <div className="footer-col">
              <h5>Sessions</h5>
              <a href="/book/">Book a Consultation</a>
              <a href="/#how">How It Works</a>
              <a href="/meet/">Meet Dr. Fat</a>
              <a href="/#areas">Areas of Practice</a>
            </div>
            <div className="footer-col">
              <h5>Legal</h5>
              <a href="/privacy/">Privacy Policy</a>
              <a href="/terms/">Terms of Service</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 ConsultDrFat. All rights reserved.</span>
            <span>🔒 Encrypted · 🇳🇬 Nigeria · MDCN Registered</span>
          </div>
        </div>
      </footer>

      {/* Floating session bubble is in GlobalShell — follows user across all pages */}
    </>
  );
}
