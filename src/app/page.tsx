import Link from "next/link";

export default function Home() {
  return (
    <>
      {/* ── HERO ── */}
      <section className="hero">
        <div className="wrap">
          <nav className="nav">
            <div className="brand">
              <div className="brand-icon">🩺</div>
              <div className="brand-text">
                <span>ConsultDrFat</span>
                <small>Medical Consultations</small>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Link href="/book/" className="btn btn-primary btn-sm">Book Now</Link>
              <Link href="/admin/" className="btn btn-ghost-white btn-sm">Practitioner</Link>
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
                care in a secure, confidential session. Pay in naira. No queues.
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
                  30-min focused sessions
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
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
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
              From booking to your session — everything is designed to be simple, 
              private, and professional. No waiting rooms, no hassle.
            </p>
          </div>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-num">01</div>
              <div className="step-icon">📅</div>
              <h3>Choose Your Slot</h3>
              <p>
                Browse available appointment times for the next two weeks. 
                Pick a slot that works for you — mornings, afternoons, or evenings.
              </p>
            </div>
            <div className="step-card">
              <div className="step-num">02</div>
              <div className="step-icon">💳</div>
              <h3>Pay Securely</h3>
              <p>
                Pay in naira using your bank card, bank transfer, OPay, or PalmPay. 
                Your slot is confirmed immediately after payment.
              </p>
            </div>
            <div className="step-card">
              <div className="step-num">03</div>
              <div className="step-icon">🩺</div>
              <h3>Consult Dr. Fat</h3>
              <p>
                Join your private room at the scheduled time — voice call, live chat, 
                and a shared timer. Get your diagnosis, advice, and next steps.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHY CONSULT DR. FAT ── */}
      <section className="section" style={{ background: "var(--teal-pale)", marginTop: 0 }}>
        <div className="wrap">
          <div className="section-head">
            <div className="section-label">Why Choose Us</div>
            <h2>Medicine you can trust, care you can feel.</h2>
            <p>
              ConsultDrFat was built for Nigerians who deserve quality medical 
              attention without the stress of traffic, queues, and long waits.
            </p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon-box fi-teal">🔐</div>
              <div>
                <h4>Fully Private & Confidential</h4>
                <p>
                  All sessions are encrypted end-to-end. Your health information 
                  stays between you and Dr. Fat — never shared, never stored 
                  beyond your session.
                </p>
              </div>
            </div>
            <div className="feature-card">
              <div className="feature-icon-box fi-sky">🩺</div>
              <div>
                <h4>Qualified & Experienced Doctor</h4>
                <p>
                  Dr. Fat is a fully registered medical practitioner with over 8 years 
                  of clinical experience — general practice, chronic disease management, 
                  and preventive care.
                </p>
              </div>
            </div>
            <div className="feature-card">
              <div className="feature-icon-box fi-gold">⏱</div>
              <div>
                <h4>Focused 30-Minute Sessions</h4>
                <p>
                  No rushed 5-minute slots. Every session is 30 minutes of dedicated 
                  one-on-one time. If you need more time, you can extend mid-session.
                </p>
              </div>
            </div>
            <div className="feature-card">
              <div className="feature-icon-box fi-navy">🇳🇬</div>
              <div>
                <h4>Built for Nigeria</h4>
                <p>
                  Pay in naira via card, bank transfer, OPay, or PalmPay — methods 
                  Nigerians use every day. Sessions run on a reliable connection 
                  optimised for local internet speeds.
                </p>
              </div>
            </div>
            <div className="feature-card">
              <div className="feature-icon-box fi-teal">💬</div>
              <div>
                <h4>Voice + Chat in One Room</h4>
                <p>
                  Speak directly with Dr. Fat by voice, or use the live chat if 
                  voice isn't convenient. Both sides see the same shared countdown 
                  so time is never wasted.
                </p>
              </div>
            </div>
            <div className="feature-card">
              <div className="feature-icon-box fi-sky">📋</div>
              <div>
                <h4>Digital Notes & Referrals</h4>
                <p>
                  After your session, receive a typed summary of your consultation — 
                  recommendations, prescriptions, or referrals as needed, sent 
                  directly to your email.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CONDITIONS WE CONSULT ── */}
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div className="section-label">Areas of Practice</div>
            <h2>Conditions we can help with.</h2>
            <p>
              Whether it's a nagging concern or an urgent question — Dr. Fat 
              handles a broad range of everyday medical needs.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[
              { icon: "🤒", title: "Fever & Infections", desc: "Malaria, typhoid, chest infections, UTIs and general illness" },
              { icon: "💊", title: "Chronic Conditions", desc: "Diabetes, hypertension, asthma — monitoring & management" },
              { icon: "🧠", title: "Mental Wellness", desc: "Stress, anxiety, sleep problems, low mood — compassionate support" },
              { icon: "🍽", title: "Nutrition & Lifestyle", desc: "Weight management, dietary guidance, healthy living plans" },
              { icon: "👶", title: "Child Health", desc: "Paediatric questions, vaccinations, growth & development" },
              { icon: "🩸", title: "Lab Result Review", desc: "Interpret your blood work, scans, and test results clearly" },
            ].map((c) => (
              <div className="card" key={c.title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{c.icon}</div>
                <div>
                  <h4 style={{ fontSize: 15, marginBottom: 5, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{c.title}</h4>
                  <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="section-sm">
        <div className="wrap">
          <div className="cta-band">
            <h2>Ready to speak with Dr. Fat?</h2>
            <p>
              Book your session today. Available appointments for the next 14 days.<br/>
              Secure, private, and professional — from wherever you are in Nigeria.
            </p>
            <Link href="/book/" className="btn btn-primary btn-lg">
              📅 Book Your Consultation
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="wrap">
          <div className="footer-inner">
            <div className="footer-brand">
              <div className="brand" style={{ marginBottom: 12 }}>
                <div className="brand-icon">🩺</div>
                <div className="brand-text">
                  <span style={{ color: "#fff" }}>ConsultDrFat</span>
                  <small>Medical Consultations</small>
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
              <a href="/#areas">Areas of Practice</a>
            </div>
            <div className="footer-col">
              <h5>Legal</h5>
              <a href="/privacy/">Privacy Policy</a>
              <a href="/terms/">Terms of Service</a>
              <a href="/admin/">Practitioner Login</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 ConsultDrFat. All rights reserved.</span>
            <span>🔒 Encrypted · 🇳🇬 Nigeria · MDCN Registered</span>
          </div>
        </div>
      </footer>
    </>
  );
}
