import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Meet Dr. Fat — ConsultDrFat",
  description: "Learn about Dr. Fat — a qualified, MDCN-registered Nigerian doctor with 8+ years of clinical experience in general practice and telemedicine.",
};

export default function MeetPage() {
  const credentials = [
    { icon: "🎓", title: "MBBS – Medicine & Surgery", sub: "University of Lagos · 2014" },
    { icon: "🏥", title: "MDCN Registered", sub: "Medical & Dental Council of Nigeria" },
    { icon: "📋", title: "General & Family Medicine", sub: "Primary care, chronic disease, preventive health" },
    { icon: "💻", title: "Telemedicine Specialist", sub: "4+ years of digital-first patient care in Nigeria" },
    { icon: "🧠", title: "Mental Wellness Support", sub: "Stress, anxiety, sleep disorders, low mood" },
    { icon: "👶", title: "Paediatric Consultations", sub: "Child health, vaccinations, growth & development" },
  ];

  const specialties = [
    { icon: "🤒", label: "Fever & Infections" },
    { icon: "💊", label: "Chronic Conditions" },
    { icon: "🧠", label: "Mental Wellness" },
    { icon: "🍽", label: "Nutrition & Lifestyle" },
    { icon: "👶", label: "Child Health" },
    { icon: "🩸", label: "Lab Result Review" },
    { icon: "❤️", label: "Cardiovascular Care" },
    { icon: "🌿", label: "Preventive Medicine" },
  ];

  const reviews = [
    { name: "Amaka O.", location: "Lagos", text: "Dr. Fat was incredibly thorough. I got a real diagnosis in 30 minutes without leaving my house. Will definitely be back.", stars: 5 },
    { name: "Chidi N.", location: "Abuja", text: "Finally a doctor who actually listens. He explained everything clearly and followed up on my blood pressure results.", stars: 5 },
    { name: "Fatima A.", location: "Kano", text: "The platform is seamless and Dr. Fat is professional and kind. I recommended it to my whole family.", stars: 5 },
  ];

  return (
    <>
      {/* ── Navigation ── */}
      <div className="meet-nav-wrap">
        <div className="wrap">
          <nav className="nav">
            <Link href="/" className="brand">
              <div className="brand-icon">🩺</div>
              <div className="brand-text">
                <span>ConsultDrFat</span>
                <small>Medical Consultations</small>
              </div>
            </Link>
            <div style={{ display: "flex", gap: 10 }}>
              <Link href="/" className="btn btn-ghost btn-sm">← Home</Link>
              <Link href="/book/" className="btn btn-primary btn-sm">Book Now</Link>
            </div>
          </nav>
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="meet-hero">
        <div className="wrap">
          <div className="meet-hero-inner">
            {/* Left text */}
            <div className="meet-hero-text">
              <div className="meet-pill">👨‍⚕️ Practitioner Profile</div>
              <h1>Meet <em>Dr. Fat</em></h1>
              <p>
                A qualified, MDCN-registered Nigerian doctor bringing 8+ years of 
                clinical experience to your screen. Honest, thorough, and genuinely 
                invested in your health — no rush, no queues, no hassle.
              </p>
              <div className="meet-hero-stats">
                <div className="meet-stat">
                  <span className="meet-stat-val">8+</span>
                  <span className="meet-stat-lbl">Years experience</span>
                </div>
                <div className="meet-stat-divider" />
                <div className="meet-stat">
                  <span className="meet-stat-val">500+</span>
                  <span className="meet-stat-lbl">Patients helped</span>
                </div>
                <div className="meet-stat-divider" />
                <div className="meet-stat">
                  <span className="meet-stat-val">4.9★</span>
                  <span className="meet-stat-lbl">Patient rating</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 32 }}>
                <Link href="/book/" className="btn btn-primary btn-lg">📅 Book a Consultation</Link>
                <a href="#about" className="btn btn-ghost-white btn-lg">Read Full Bio</a>
              </div>
            </div>

            {/* Right avatar card */}
            <div className="meet-hero-card">
              <div className="meet-avatar">👨‍⚕️</div>
              <h3>Dr. Fat</h3>
              <p>MBBS · General Practitioner<br/>Telemedicine Specialist</p>
              <div className="meet-badge-row">
                <span className="meet-badge">🏥 MDCN Registered</span>
                <span className="meet-badge">🎓 MBBS (UNILAG)</span>
                <span className="meet-badge">🇳🇬 Based in Nigeria</span>
              </div>
              <div className="meet-avail">
                <span className="meet-avail-dot" />
                Available 6 days a week · Mon–Sat
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── About / Bio ── */}
      <section className="section" id="about">
        <div className="wrap">
          <div className="meet-bio-grid">
            <div className="meet-bio-left">
              <div className="section-label">The Doctor</div>
              <h2>Compassionate care,<br/>backed by expertise.</h2>
              <p>
                Dr. Fat is a qualified medical doctor registered with the Medical and Dental 
                Council of Nigeria (MDCN), with over 8 years of clinical experience across 
                general practice, chronic disease management, and telemedicine.
              </p>
              <p>
                Having worked in both private and public healthcare settings across Nigeria, 
                Dr. Fat brings a deep understanding of the health challenges Nigerians face 
                every day — and a practical, compassionate approach to addressing them.
              </p>
              <p>
                ConsultDrFat was built on a simple belief: every Nigerian deserves quality 
                medical attention without a 2-hour wait or a costly commute. Every session 
                is 30 focused, unhurried minutes — dedicated entirely to you.
              </p>
              <div className="meet-trust-row">
                <div className="meet-trust-item">
                  <span className="meet-trust-icon">🔒</span>
                  <span>All sessions fully encrypted</span>
                </div>
                <div className="meet-trust-item">
                  <span className="meet-trust-icon">📋</span>
                  <span>MDCN licence verified</span>
                </div>
                <div className="meet-trust-item">
                  <span className="meet-trust-icon">🇳🇬</span>
                  <span>Serving Nigeria nationwide</span>
                </div>
              </div>
            </div>

            <div className="meet-bio-right">
              <div className="section-label" style={{ marginBottom: 16 }}>Qualifications &amp; Expertise</div>
              <div className="meet-cred-list">
                {credentials.map((c) => (
                  <div className="meet-cred-item" key={c.title}>
                    <div className="meet-cred-icon">{c.icon}</div>
                    <div>
                      <div className="meet-cred-title">{c.title}</div>
                      <div className="meet-cred-sub">{c.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Specialties ── */}
      <section className="section" style={{ background: "var(--teal-pale)", paddingTop: 0, marginTop: 0 }}>
        <div className="wrap">
          <div className="section-head" style={{ textAlign: "center", maxWidth: 520, margin: "0 auto 40px" }}>
            <div className="section-label" style={{ justifyContent: "center" }}>Areas of Practice</div>
            <h2>What Dr. Fat can help with</h2>
            <p>A broad range of everyday medical needs — handled professionally.</p>
          </div>
          <div className="meet-spec-grid">
            {specialties.map((s) => (
              <div className="meet-spec-card" key={s.label}>
                <span className="meet-spec-icon">{s.icon}</span>
                <span className="meet-spec-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Patient Reviews ── */}
      <section className="section">
        <div className="wrap">
          <div className="section-head" style={{ textAlign: "center", maxWidth: 520, margin: "0 auto 40px" }}>
            <div className="section-label" style={{ justifyContent: "center" }}>Patient Reviews</div>
            <h2>What patients say about Dr. Fat</h2>
            <p>Real feedback from patients who&apos;ve experienced ConsultDrFat.</p>
          </div>
          <div className="meet-reviews-grid">
            {reviews.map((r) => (
              <div className="meet-review-card" key={r.name}>
                <div className="meet-review-stars">{"★".repeat(r.stars)}</div>
                <p className="meet-review-text">&ldquo;{r.text}&rdquo;</p>
                <div className="meet-review-author">
                  <div className="meet-review-avatar">{r.name[0]}</div>
                  <div>
                    <div className="meet-review-name">{r.name}</div>
                    <div className="meet-review-loc">📍 {r.location}</div>
                  </div>
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
              Book a private session today — available 6 days a week.<br/>
              Secure, confidential, and entirely in your hands.
            </p>
            <Link href="/book/" className="btn btn-primary btn-lg">📅 Book Your Consultation</Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
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
              <p>Private, secure medical consultations with a qualified Nigerian doctor. Pay in naira. Available 6 days a week.</p>
            </div>
            <div className="footer-col">
              <h5>Platform</h5>
              <a href="/book/">Book a Consultation</a>
              <a href="/#how">How It Works</a>
              <a href="/meet/">Meet Dr. Fat</a>
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
    </>
  );
}
