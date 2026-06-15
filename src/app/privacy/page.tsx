import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — ConsultDrFat",
  description: "How ConsultDrFat collects, uses, and protects your personal and medical information. NDPR compliant.",
};

const lastUpdated = "15 June 2026";

export default function PrivacyPage() {
  return (
    <>
      {/* ── Nav ── */}
      <div style={{ background: "var(--navy)", padding: "0" }}>
        <div className="wrap">
          <nav className="nav">
            <Link href="/" className="brand">
              <div className="brand-icon">🩺</div>
              <div className="brand-text">
                <span style={{ color: "#fff" }}>ConsultDrFat</span>
                <small>Medical Consultations</small>
              </div>
            </Link>
            <Link href="/book/" className="btn btn-primary btn-sm">Book Consultation</Link>
          </nav>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="legal-hero">
        <div className="wrap">
          <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 24px" }}>
            <div className="section-label" style={{ color: "#9FD8D3", marginBottom: 12 }}>
              Legal Document
            </div>
            <h1 style={{ color: "#fff", marginBottom: 10 }}>Privacy Policy</h1>
            <p style={{ color: "rgba(255,255,255,.6)", fontSize: 14 }}>
              Last updated: {lastUpdated} &nbsp;·&nbsp; Effective immediately &nbsp;·&nbsp; 
              Compliant with the Nigeria Data Protection Regulation (NDPR) 2019
            </p>
          </div>
        </div>
      </div>

      <div className="legal-page">

        {/* ── Intro highlight ── */}
        <div className="legal-highlight" style={{ marginBottom: 40 }}>
          <p>
            <strong>Plain-language summary:</strong> ConsultDrFat collects only what is necessary to 
            provide you with a safe, private medical consultation. We do not sell your data. We do not 
            share your health information with third parties except where required to operate the service 
            (e.g. payment processing) or comply with Nigerian law. You have the right to access, correct, 
            or delete your information at any time.
          </p>
        </div>

        {/* ── TOC ── */}
        <div className="legal-toc">
          <h4>Table of Contents</h4>
          <ol>
            <li><a href="#s1">Who We Are</a></li>
            <li><a href="#s2">Information We Collect</a></li>
            <li><a href="#s3">How We Use Your Information</a></li>
            <li><a href="#s4">Legal Basis for Processing (NDPR)</a></li>
            <li><a href="#s5">Data Sharing &amp; Third Parties</a></li>
            <li><a href="#s6">Security &amp; Encryption</a></li>
            <li><a href="#s7">Data Retention</a></li>
            <li><a href="#s8">Your Rights</a></li>
            <li><a href="#s9">Cookies &amp; Local Storage</a></li>
            <li><a href="#s10">Children&apos;s Privacy</a></li>
            <li><a href="#s11">Changes to This Policy</a></li>
            <li><a href="#s12">Contact Us</a></li>
          </ol>
        </div>

        {/* ── Section 1 ── */}
        <div className="legal-section" id="s1">
          <h2>1. Who We Are</h2>
          <p>
            ConsultDrFat (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is an online telemedicine platform operated by the 
            practitioner known as Dr. Fat, a medical doctor registered with the Medical and Dental 
            Council of Nigeria (MDCN). Our platform enables patients in Nigeria to book and attend 
            private, paid medical consultations via the internet.
          </p>
          <p>
            We operate under Nigerian law, including the Nigeria Data Protection Regulation (NDPR) 
            2019 issued by the National Information Technology Development Agency (NITDA), and the 
            relevant provisions of the Nigerian Data Protection Act 2023 (NDPA).
          </p>
          <p>
            For the purposes of this policy, ConsultDrFat is the <strong>data controller</strong> 
            of your personal information.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 2 ── */}
        <div className="legal-section" id="s2">
          <h2>2. Information We Collect</h2>
          
          <h3>2.1 Information you provide directly</h3>
          <ul>
            <li><strong>Google account information:</strong> When you sign in with Google, we receive your name, email address, and Google account profile photo.</li>
            <li><strong>Consultation topic:</strong> A brief description of what you wish to discuss during your session (entered during booking).</li>
            <li><strong>Payment information:</strong> We collect your name and email as entered during Paystack checkout. We do <strong>not</strong> receive or store your card number, CVV, or bank account details — these are handled exclusively by Paystack (PCI-DSS Level 1 certified).</li>
          </ul>

          <h3>2.2 Information collected automatically</h3>
          <ul>
            <li><strong>Session data:</strong> Chat messages sent during a consultation, session timestamps (start time, end time, any extensions).</li>
            <li><strong>Technical data:</strong> Browser type, device type, IP address, and connection quality data used to establish the WebRTC voice connection.</li>
            <li><strong>Usage data:</strong> Pages visited and actions taken on our platform (booking flow, session room interactions).</li>
          </ul>

          <h3>2.3 Information we do NOT collect</h3>
          <ul>
            <li>We do not record voice calls. Voice is transmitted peer-to-peer (WebRTC), encrypted in transit, and is not stored on our servers.</li>
            <li>We do not collect government ID numbers, NIN, BVN, or any biometric data.</li>
            <li>We do not use tracking pixels or third-party advertising technologies.</li>
          </ul>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 3 ── */}
        <div className="legal-section" id="s3">
          <h2>3. How We Use Your Information</h2>
          <p>We use the information we collect for the following purposes:</p>
          <ul>
            <li><strong>To provide the service:</strong> Authenticate your identity, create and manage your booking, facilitate payment, and connect you to your consultation room.</li>
            <li><strong>To communicate with you:</strong> Send booking confirmation emails, appointment reminders (24h and 1h before), and post-session summaries.</li>
            <li><strong>To improve the platform:</strong> Understand how the platform is used in aggregate and fix technical issues.</li>
            <li><strong>To comply with legal obligations:</strong> Respond to lawful requests from Nigerian regulatory authorities or courts.</li>
            <li><strong>For financial records:</strong> Maintain payment transaction records as required by Nigerian tax and financial regulations.</li>
          </ul>
          <p>
            We will never use your medical consultation topics, chat messages, or health-related 
            information for marketing, advertising, or profiling purposes.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 4 ── */}
        <div className="legal-section" id="s4">
          <h2>4. Legal Basis for Processing (NDPR)</h2>
          <p>Under the Nigeria Data Protection Regulation 2019, we process your data on the following bases:</p>
          <ul>
            <li><strong>Performance of a contract:</strong> Processing your booking, facilitating payment, and running the consultation room — necessary to deliver the service you have requested.</li>
            <li><strong>Consent:</strong> Sending appointment reminder emails. You may withdraw this consent at any time by contacting us.</li>
            <li><strong>Legitimate interests:</strong> Fraud prevention, platform security, and aggregate usage analytics (where these do not override your rights).</li>
            <li><strong>Legal obligation:</strong> Retaining financial transaction records as required by Nigerian law.</li>
          </ul>
          <p>
            Because consultations involve health-related topics (a special category of data under the NDPR), 
            we take additional precautions: health information is not stored beyond what is necessary, 
            chat logs are only accessible to the practitioner and the specific client involved, and no 
            health data is shared with any advertising, marketing, or analytics third party.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 5 ── */}
        <div className="legal-section" id="s5">
          <h2>5. Data Sharing &amp; Third Parties</h2>
          <p>
            We do not sell, rent, or trade your personal information. We share data with the following 
            trusted third parties only to the extent necessary to operate the platform:
          </p>
          <ul>
            <li>
              <strong>Google (Firebase &amp; Google Auth):</strong> We use Google Firebase for authentication, 
              real-time database (Firestore), and cloud infrastructure. Data is processed under 
              Google&apos;s Privacy Policy and Data Processing Addendum. Firebase is hosted in 
              Google&apos;s cloud infrastructure.
            </li>
            <li>
              <strong>Paystack:</strong> Payment processing. Paystack receives your name, email, and 
              payment method details. They are PCI-DSS Level 1 certified. See Paystack&apos;s 
              Privacy Policy at <a href="https://paystack.com/privacy" target="_blank" rel="noopener noreferrer">paystack.com/privacy</a>.
            </li>
            <li>
              <strong>Cloudflare:</strong> Content delivery, DDoS protection, and TURN relay servers 
              for voice call NAT traversal (only IP addresses and encrypted audio data pass through 
              their relay servers). See Cloudflare&apos;s Privacy Policy at 
              <a href="https://cloudflare.com/privacypolicy" target="_blank" rel="noopener noreferrer"> cloudflare.com/privacypolicy</a>.
            </li>
            <li>
              <strong>Email provider (Brevo/Sendinblue):</strong> We use Brevo to send transactional 
              emails (booking confirmation, reminders). Brevo receives your name and email address only.
            </li>
          </ul>
          <p>
            We may disclose personal information if required to do so by law, a court order, or 
            a lawful request from a Nigerian regulatory authority (such as NITDA or the NDPB).
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 6 ── */}
        <div className="legal-section" id="s6">
          <h2>6. Security &amp; Encryption</h2>
          <ul>
            <li><strong>Voice calls:</strong> All WebRTC voice communication is encrypted end-to-end using DTLS-SRTP. Cloudflare&apos;s TURN relay servers only see encrypted ciphertext — they cannot decode your conversation.</li>
            <li><strong>Data in transit:</strong> All platform traffic uses HTTPS (TLS 1.2+). Firestore communication is encrypted in transit.</li>
            <li><strong>Data at rest:</strong> Firebase Firestore encrypts data at rest by default.</li>
            <li><strong>Access controls:</strong> Firestore Security Rules ensure that each client can only access their own booking and session data. The practitioner can access all bookings. No public read access is permitted.</li>
            <li><strong>Payment security:</strong> Card data is processed exclusively by Paystack and never touches our servers. We are not in the card data flow.</li>
          </ul>
          <p>
            While we employ industry-standard security measures, no internet-based system is 100% 
            secure. If you believe your account has been compromised, contact us immediately.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 7 ── */}
        <div className="legal-section" id="s7">
          <h2>7. Data Retention</h2>
          <ul>
            <li><strong>Booking records:</strong> Retained for 7 years from the date of the booking, as required for financial and tax compliance under Nigerian law.</li>
            <li><strong>Session chat messages:</strong> Retained for 90 days from the session date, then automatically deleted. You may request earlier deletion.</li>
            <li><strong>Account data (Google profile info):</strong> Retained while you have an account or have made a booking. Deleted upon request (subject to legal retention requirements).</li>
            <li><strong>Payment transaction records:</strong> Retained for 7 years as required by Nigerian financial regulations.</li>
          </ul>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 8 ── */}
        <div className="legal-section" id="s8">
          <h2>8. Your Rights</h2>
          <p>Under the NDPR and NDPA, you have the following rights regarding your personal data:</p>
          <ul>
            <li><strong>Right of access:</strong> Request a copy of the personal data we hold about you.</li>
            <li><strong>Right to rectification:</strong> Request correction of inaccurate or incomplete data.</li>
            <li><strong>Right to erasure:</strong> Request deletion of your personal data (subject to legal retention requirements).</li>
            <li><strong>Right to object:</strong> Object to processing based on legitimate interests.</li>
            <li><strong>Right to data portability:</strong> Request your data in a structured, machine-readable format.</li>
            <li><strong>Right to withdraw consent:</strong> Where processing is based on consent (e.g. reminder emails), withdraw at any time without affecting prior lawful processing.</li>
          </ul>
          <p>
            To exercise any of these rights, contact us at the address in Section 12. We will respond 
            within <strong>30 days</strong>. We may need to verify your identity before processing 
            the request.
          </p>
          <p>
            If you are not satisfied with how we handle a request or complaint, you have the right to 
            lodge a complaint with the Nigeria Data Protection Bureau (NDPB) at 
            <a href="https://ndpb.gov.ng" target="_blank" rel="noopener noreferrer"> ndpb.gov.ng</a>.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 9 ── */}
        <div className="legal-section" id="s9">
          <h2>9. Cookies &amp; Local Storage</h2>
          <p>
            ConsultDrFat uses the following technologies to maintain your session and improve performance:
          </p>
          <ul>
            <li><strong>Firebase Authentication cookies/tokens:</strong> Used to keep you signed in during and between sessions. These are essential to the service — without them you cannot sign in or access your booking.</li>
            <li><strong>Browser local storage:</strong> Used by the Progressive Web App (PWA) service worker to enable offline loading of static assets (the app shell). No personal data is stored in local storage.</li>
            <li><strong>No advertising or tracking cookies.</strong> We do not use Google Analytics, Facebook Pixel, or any third-party tracking technology.</li>
          </ul>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 10 ── */}
        <div className="legal-section" id="s10">
          <h2>10. Children&apos;s Privacy</h2>
          <p>
            Our platform is intended for adults (18 years and older) seeking medical consultations. 
            We do not knowingly collect personal data from individuals under 18. If a parent or guardian 
            wishes to use the platform on behalf of a minor for paediatric consultation purposes, they 
            must be present and acting as the account holder.
          </p>
          <p>
            If you believe a person under 18 has created an account without parental consent, 
            please contact us immediately and we will delete the account.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 11 ── */}
        <div className="legal-section" id="s11">
          <h2>11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time to reflect changes in our practices, 
            technology, legal requirements, or for other operational reasons. When we make material 
            changes, we will update the &ldquo;Last updated&rdquo; date at the top of this document and, 
            where appropriate, notify you by email.
          </p>
          <p>
            Your continued use of ConsultDrFat after any changes constitutes your acceptance of the 
            updated Privacy Policy. We encourage you to review this policy periodically.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 12 ── */}
        <div className="legal-section" id="s12">
          <h2>12. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, wish to exercise your data rights, 
            or want to report a privacy concern, please contact us:
          </p>
          <div className="legal-contact-card">
            <div className="lcc-icon">✉️</div>
            <div>
              <h5>ConsultDrFat — Data Privacy</h5>
              <p>Email: <a href="mailto:privacy@consultdrfat.com">privacy@consultdrfat.com</a></p>
              <p>For urgent session-related matters: <a href="mailto:hello@consultdrfat.com">hello@consultdrfat.com</a></p>
            </div>
          </div>
          <div className="legal-contact-card" style={{ marginTop: 12 }}>
            <div className="lcc-icon">🏛️</div>
            <div>
              <h5>Nigeria Data Protection Bureau (NDPB)</h5>
              <p>If you wish to file a complaint with the supervisory authority:</p>
              <p><a href="https://ndpb.gov.ng" target="_blank" rel="noopener noreferrer">ndpb.gov.ng</a> · No. 28 Port Harcourt Crescent, Abuja, Nigeria</p>
            </div>
          </div>
        </div>

        {/* ── Back link ── */}
        <div style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid var(--line)", display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/" className="btn btn-ghost">← Back to Home</Link>
          <Link href="/terms/" className="btn btn-ghost">Terms of Service →</Link>
          <Link href="/book/" className="btn btn-primary">📅 Book a Consultation</Link>
        </div>
      </div>

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
              <p>Private, secure medical consultations with a qualified Nigerian doctor.</p>
            </div>
            <div className="footer-col">
              <h5>Platform</h5>
              <a href="/book/">Book a Consultation</a>
              <a href="/#how">How It Works</a>
              <a href="/#meet">Meet Dr. Fat</a>
            </div>
            <div className="footer-col">
              <h5>Legal</h5>
              <a href="/privacy/">Privacy Policy</a>
              <a href="/terms/">Terms of Service</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 ConsultDrFat. All rights reserved.</span>
            <span>🔒 NDPR Compliant · 🇳🇬 Nigeria</span>
          </div>
        </div>
      </footer>
    </>
  );
}
