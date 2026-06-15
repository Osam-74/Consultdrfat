import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — ConsultDrFat",
  description: "The terms governing your use of the ConsultDrFat online medical consultation platform.",
};

const lastUpdated = "15 June 2026";

export default function TermsPage() {
  return (
    <>
      {/* ── Nav ── */}
      <div style={{ background: "var(--navy)" }}>
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
            <h1 style={{ color: "#fff", marginBottom: 10 }}>Terms of Service</h1>
            <p style={{ color: "rgba(255,255,255,.6)", fontSize: 14 }}>
              Last updated: {lastUpdated} &nbsp;·&nbsp; Effective immediately &nbsp;·&nbsp; 
              Governed by the laws of the Federal Republic of Nigeria
            </p>
          </div>
        </div>
      </div>

      <div className="legal-page">

        {/* ── Intro highlight ── */}
        <div className="legal-highlight" style={{ marginBottom: 40 }}>
          <p>
            <strong>Important:</strong> By using ConsultDrFat, you agree to these Terms. Please read 
            them carefully. Key points: consultations are for general medical advice only and do not 
            replace emergency care; payment is required before the session begins; sessions are 
            non-refundable once joined; you must be 18 or older to create an account.
          </p>
        </div>

        {/* ── Medical disclaimer ── */}
        <div className="legal-highlight" style={{ borderLeftColor: "var(--gold)", background: "var(--gold-soft)", marginBottom: 40 }}>
          <p style={{ color: "var(--ink-2)" }}>
            ⚠️ <strong>Medical Disclaimer:</strong> ConsultDrFat provides online medical consultations 
            with a qualified Nigerian doctor. However, this service is not a substitute for emergency 
            medical care. If you are experiencing a medical emergency, call the Nigerian Emergency 
            number (112) or go to your nearest hospital immediately. The practitioner&apos;s advice 
            is based solely on information you provide during the session and without physical examination.
          </p>
        </div>

        {/* ── TOC ── */}
        <div className="legal-toc">
          <h4>Table of Contents</h4>
          <ol>
            <li><a href="#t1">Agreement to Terms</a></li>
            <li><a href="#t2">The Service</a></li>
            <li><a href="#t3">Eligibility &amp; Account</a></li>
            <li><a href="#t4">Booking &amp; Scheduling</a></li>
            <li><a href="#t5">Payment &amp; Fees</a></li>
            <li><a href="#t6">Cancellations &amp; Refunds</a></li>
            <li><a href="#t7">Session Rules &amp; Conduct</a></li>
            <li><a href="#t8">Medical Advice — Scope &amp; Limitations</a></li>
            <li><a href="#t9">Intellectual Property</a></li>
            <li><a href="#t10">Limitation of Liability</a></li>
            <li><a href="#t11">Indemnification</a></li>
            <li><a href="#t12">Termination</a></li>
            <li><a href="#t13">Governing Law &amp; Disputes</a></li>
            <li><a href="#t14">Changes to Terms</a></li>
            <li><a href="#t15">Contact</a></li>
          </ol>
        </div>

        {/* ── Section 1 ── */}
        <div className="legal-section" id="t1">
          <h2>1. Agreement to Terms</h2>
          <p>
            By accessing or using the ConsultDrFat platform (the &ldquo;Platform&rdquo;), including creating 
            an account, making a booking, or joining a session, you (&ldquo;User&rdquo;, &ldquo;you&rdquo;, &ldquo;your&rdquo;) 
            agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;), our 
            <Link href="/privacy/"> Privacy Policy</Link>, and all applicable Nigerian laws and regulations.
          </p>
          <p>
            If you do not agree with any part of these Terms, you must not use the Platform. These 
            Terms constitute a legally binding agreement between you and ConsultDrFat.
          </p>
          <p>
            We reserve the right to update these Terms at any time. Continued use of the Platform 
            after changes constitutes acceptance of the updated Terms.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 2 ── */}
        <div className="legal-section" id="t2">
          <h2>2. The Service</h2>
          <p>
            ConsultDrFat is an online telemedicine platform that connects patients in Nigeria with 
            a single qualified medical practitioner (Dr. Fat, MBBS, MDCN-registered) via:
          </p>
          <ul>
            <li>A booking system for scheduling private consultations</li>
            <li>An online payment system (Paystack) for session fees in Nigerian Naira (₦)</li>
            <li>A real-time consultation room with voice (WebRTC) and live chat</li>
            <li>A shared countdown timer and, where needed, paid session extensions</li>
            <li>Email notifications for booking confirmation and appointment reminders</li>
          </ul>
          <p>
            The Platform is a Progressive Web App (PWA) installable on your device. It operates 
            in Nigeria and sessions are conducted in English or as agreed with the practitioner.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 3 ── */}
        <div className="legal-section" id="t3">
          <h2>3. Eligibility &amp; Account</h2>
          <h3>3.1 Age requirement</h3>
          <p>
            You must be at least <strong>18 years of age</strong> to create an account and make a 
            booking. Parents or guardians may use the platform on behalf of a minor for paediatric 
            consultations, provided the parent/guardian creates and manages the account.
          </p>
          <h3>3.2 Google account sign-in</h3>
          <p>
            Authentication is provided exclusively through Google Sign-In. By signing in, you 
            authorise ConsultDrFat to receive your Google account name and email address. You are 
            responsible for the security of your Google account.
          </p>
          <h3>3.3 Accurate information</h3>
          <p>
            You agree to provide accurate, current, and complete information when booking a consultation, 
            including your name, email, and a truthful description of your medical concern. Providing 
            false or misleading information may result in termination of your account and no refund 
            of fees paid.
          </p>
          <h3>3.4 One account per person</h3>
          <p>
            Each Google account may be used by one individual only. You may not create multiple 
            accounts to circumvent booking restrictions or any other platform rules.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 4 ── */}
        <div className="legal-section" id="t4">
          <h2>4. Booking &amp; Scheduling</h2>
          <h3>4.1 Booking window</h3>
          <p>
            You may book a consultation up to <strong>14 calendar days</strong> in advance. The 
            booking window rolls forward daily. You cannot book slots more than 14 days ahead.
          </p>
          <h3>4.2 Slot availability</h3>
          <p>
            Available slots are determined by the practitioner&apos;s configured weekly availability 
            and any exceptions (days off or additional hours). Slots are shown in West Africa Time 
            (WAT, Africa/Lagos, UTC+1).
          </p>
          <h3>4.3 Booking confirmation</h3>
          <p>
            A booking is confirmed only upon <strong>successful payment</strong>. An unpaid booking 
            (status: &ldquo;held&rdquo;) does not guarantee your slot. You will receive a confirmation 
            email upon successful payment.
          </p>
          <h3>4.4 Late arrival</h3>
          <p>
            Sessions start at the scheduled time. If you are more than <strong>10 minutes late</strong>, 
            the session may be marked as missed at the practitioner&apos;s discretion and no refund 
            will be issued. The practitioner will wait up to 10 minutes.
          </p>
          <h3>4.5 Rescheduling</h3>
          <p>
            To reschedule, contact us at least <strong>24 hours</strong> before your session. 
            Rescheduling is subject to availability and is at the practitioner&apos;s discretion. 
            Rescheduling within 24 hours of the session may be treated as a cancellation.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 5 ── */}
        <div className="legal-section" id="t5">
          <h2>5. Payment &amp; Fees</h2>
          <h3>5.1 Session fee</h3>
          <p>
            Session fees are set by the practitioner and displayed on the booking page in Nigerian 
            Naira (₦). Fees may change from time to time; the fee applicable is the one shown at 
            the time of booking.
          </p>
          <h3>5.2 Payment methods</h3>
          <p>
            Payment is processed by <strong>Paystack</strong> and includes: debit/credit cards 
            (Verve, Mastercard, Visa), bank transfer, and mobile money providers available via 
            Paystack (OPay, PalmPay, Kuda, etc.).
          </p>
          <h3>5.3 Kobo conversion</h3>
          <p>
            Naira amounts are sent to Paystack in kobo (1 NGN = 100 kobo), as required by 
            Paystack&apos;s API. This is a technical detail that does not affect what you pay.
          </p>
          <h3>5.4 Session extensions</h3>
          <p>
            During a live session, the practitioner may offer a paid extension if more time is 
            needed. Extension fees are calculated proportionally to the base session rate. 
            Extensions must be paid before the timer is extended. Extensions are non-refundable 
            once the additional time begins.
          </p>
          <h3>5.5 Taxes</h3>
          <p>
            All prices are inclusive of any applicable taxes unless otherwise stated. The 
            practitioner is responsible for applicable VAT/WHT obligations under Nigerian law.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 6 ── */}
        <div className="legal-section" id="t6">
          <h2>6. Cancellations &amp; Refunds</h2>
          <h3>6.1 Client cancellations</h3>
          <ul>
            <li><strong>More than 24 hours before session:</strong> Full refund, less any payment processor fees charged by Paystack (typically 1.5%).</li>
            <li><strong>Between 12 and 24 hours before session:</strong> 50% refund.</li>
            <li><strong>Less than 12 hours before session or no-show:</strong> No refund.</li>
            <li><strong>After joining the session room:</strong> No refund.</li>
          </ul>
          <h3>6.2 Practitioner cancellations</h3>
          <p>
            If the practitioner cancels or is unable to attend a confirmed booking, you will 
            receive a <strong>full refund</strong> within 5–7 business days. We will contact 
            you to reschedule at no additional charge.
          </p>
          <h3>6.3 Technical issues</h3>
          <p>
            If a session cannot proceed due to a verified platform-side technical failure 
            (not your internet connection or device), a full or proportional refund will be 
            issued at our discretion. We will make reasonable efforts to resume or reschedule 
            interrupted sessions.
          </p>
          <h3>6.4 Requesting a refund</h3>
          <p>
            To request a refund, email <a href="mailto:hello@consultdrfat.com">hello@consultdrfat.com</a> 
            with your booking reference, name, and reason. We will process eligible refunds within 
            7 business days.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 7 ── */}
        <div className="legal-section" id="t7">
          <h2>7. Session Rules &amp; Conduct</h2>
          <p>During a consultation, you agree to:</p>
          <ul>
            <li>Be in a private location where you can speak freely and confidentially.</li>
            <li>Treat the practitioner with respect. Abusive, threatening, or discriminatory language will result in immediate session termination with no refund.</li>
            <li>Not record the session (audio or screen) without the express written consent of the practitioner.</li>
            <li>Provide honest and accurate information about your symptoms and medical history. Withholding material information may affect the quality of advice.</li>
            <li>Not share your session link or room access with third parties.</li>
            <li>Understand that the session is a consultation, not a prescription-dispensing service. Any prescriptions or referrals are advisory and subject to Nigerian medical regulations.</li>
          </ul>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 8 ── */}
        <div className="legal-section" id="t8">
          <h2>8. Medical Advice — Scope &amp; Limitations</h2>
          <div className="legal-highlight" style={{ borderLeftColor: "var(--gold)", background: "var(--gold-soft)" }}>
            <p style={{ color: "var(--ink-2)" }}>
              <strong>This is not emergency care.</strong> If you are experiencing a life-threatening 
              emergency, call 112 or go to your nearest hospital immediately.
            </p>
          </div>
          <p>
            ConsultDrFat provides general medical consultations by a qualified Nigerian doctor. 
            The following limitations apply:
          </p>
          <ul>
            <li>Advice is based solely on the information you provide verbally. The practitioner cannot conduct physical examinations.</li>
            <li>The practitioner may advise you to seek in-person care for conditions requiring physical assessment or laboratory investigation.</li>
            <li>Prescriptions (where issued) are advisory. Dispensing is subject to compliance with Nigerian pharmaceutical regulations and the availability of medications.</li>
            <li>ConsultDrFat is not a substitute for a primary care physician relationship. For ongoing chronic conditions, we strongly recommend maintaining a relationship with an in-person doctor.</li>
            <li>Mental health support is offered at a general practitioner level. For severe psychiatric conditions, specialist referral is recommended.</li>
          </ul>
          <p>
            The practitioner is registered with the MDCN and operates within the bounds of their 
            professional registration. Any concerns about the quality of care received can be 
            reported to the MDCN at <a href="https://mdcn.gov.ng" target="_blank" rel="noopener noreferrer">mdcn.gov.ng</a>.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 9 ── */}
        <div className="legal-section" id="t9">
          <h2>9. Intellectual Property</h2>
          <p>
            All content on the ConsultDrFat platform — including but not limited to text, design, 
            graphics, logos, and software — is the property of ConsultDrFat and protected by 
            applicable Nigerian and international intellectual property laws.
          </p>
          <p>
            You may not copy, reproduce, distribute, or create derivative works from any part of 
            the Platform without express written permission.
          </p>
          <p>
            Chat messages you send during a session remain your property. By sending them, you 
            grant the practitioner a limited licence to read and use them for the purpose of 
            providing medical advice during that session.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 10 ── */}
        <div className="legal-section" id="t10">
          <h2>10. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable Nigerian law, ConsultDrFat, its operator, 
            and the practitioner shall not be liable for:
          </p>
          <ul>
            <li>Any indirect, incidental, special, or consequential damages arising from your use of the Platform.</li>
            <li>Loss of data, profits, or business opportunity.</li>
            <li>Any harm resulting from acting or failing to act on medical advice where the information provided to the practitioner was incomplete or inaccurate.</li>
            <li>Interruptions to the service caused by third-party providers (Google Firebase, Paystack, Cloudflare) or your own internet connection.</li>
            <li>Any outcome of a consultation that does not meet your expectations, provided the practitioner has acted within the bounds of their professional obligations.</li>
          </ul>
          <p>
            Our total aggregate liability for any claim arising from your use of the Platform shall 
            not exceed the amount you paid for the specific session giving rise to the claim.
          </p>
          <p>
            Nothing in these Terms excludes liability for fraud, death, or personal injury caused by 
            negligence, or any other liability that cannot be excluded or limited under Nigerian law.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 11 ── */}
        <div className="legal-section" id="t11">
          <h2>11. Indemnification</h2>
          <p>
            You agree to indemnify, defend, and hold harmless ConsultDrFat and the practitioner from 
            and against any claims, liabilities, damages, judgments, awards, losses, costs, or expenses 
            (including reasonable legal fees) arising out of or relating to:
          </p>
          <ul>
            <li>Your violation of these Terms;</li>
            <li>Your use of the Platform in a manner not permitted by these Terms;</li>
            <li>Your provision of false, incomplete, or misleading information during a booking or consultation;</li>
            <li>Any third-party claim arising from content you send during a session.</li>
          </ul>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 12 ── */}
        <div className="legal-section" id="t12">
          <h2>12. Termination</h2>
          <p>
            We reserve the right to suspend or terminate your access to ConsultDrFat at our 
            discretion, without notice, if:
          </p>
          <ul>
            <li>You breach any of these Terms;</li>
            <li>You engage in abusive, fraudulent, or unlawful behaviour;</li>
            <li>We are required to do so by law or a regulatory authority.</li>
          </ul>
          <p>
            Upon termination, your right to use the Platform ceases immediately. Any outstanding 
            bookings will be cancelled and refunds issued in accordance with Section 6.
          </p>
          <p>
            You may delete your account at any time by contacting us. Deletion is subject to our 
            data retention obligations (see Privacy Policy §7).
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 13 ── */}
        <div className="legal-section" id="t13">
          <h2>13. Governing Law &amp; Disputes</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of the 
            <strong> Federal Republic of Nigeria</strong>. Any dispute arising from or relating 
            to these Terms shall be subject to the exclusive jurisdiction of the courts of Nigeria.
          </p>
          <p>
            Before commencing legal proceedings, we encourage you to contact us to attempt to 
            resolve any dispute amicably. Most concerns can be resolved through direct communication.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 14 ── */}
        <div className="legal-section" id="t14">
          <h2>14. Changes to Terms</h2>
          <p>
            We may modify these Terms at any time. When we make material changes, we will update 
            the &ldquo;Last updated&rdquo; date and, where appropriate, notify active users by email. 
            Your continued use of the Platform after the effective date of the updated Terms 
            constitutes your acceptance.
          </p>
        </div>

        <hr className="legal-divider" />

        {/* ── Section 15 ── */}
        <div className="legal-section" id="t15">
          <h2>15. Contact</h2>
          <p>
            For questions about these Terms, cancellation requests, or any complaints:
          </p>
          <div className="legal-contact-card">
            <div className="lcc-icon">✉️</div>
            <div>
              <h5>ConsultDrFat — Legal &amp; Support</h5>
              <p>Email: <a href="mailto:hello@consultdrfat.com">hello@consultdrfat.com</a></p>
              <p>We aim to respond within 2 business days (Mon–Sat, WAT).</p>
            </div>
          </div>
        </div>

        {/* ── Back link ── */}
        <div style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid var(--line)", display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/" className="btn btn-ghost">← Back to Home</Link>
          <Link href="/privacy/" className="btn btn-ghost">Privacy Policy →</Link>
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
            <span>🇳🇬 Governed by Nigerian Law</span>
          </div>
        </div>
      </footer>
    </>
  );
}
