"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";

const EyeIcon = ({ open }: { open: boolean }) => open ? (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
) : (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
  </svg>
);

const Spinner = () => (
  <span style={{
    display: "inline-block", width: 16, height: 16, borderRadius: "50%",
    border: "2px solid currentColor", borderTopColor: "transparent",
    animation: "spin 0.7s linear infinite", flexShrink: 0,
  }} />
);

type Mode = "signin" | "register" | "reset";
interface Props { title?: string; subtitle?: string; }

export default function SignInForm({ title = "Sign In", subtitle = "Sign in to book your consultation securely." }: Props) {
  const { signInEmail, signUpEmail, signInGoogle, resetPassword, googleLoading } = useAuth();
  const [mode, setMode]           = useState<Mode>("signin");
  const [name, setName]           = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState("");
  const [resetSent, setResetSent] = useState(false);

  const friendly = (code: string) => {
    switch (code) {
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":    return "Incorrect email or password.";
      case "auth/email-already-in-use":  return "An account with this email already exists.";
      case "auth/weak-password":         return "Password must be at least 6 characters.";
      case "auth/invalid-email":         return "Please enter a valid email address.";
      case "auth/too-many-requests":     return "Too many attempts — try again later.";
      case "auth/popup-blocked":         return "Popup was blocked. Please allow popups for this site and try again.";
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request": return ""; // user closed popup — no error
      case "auth/network-request-failed": return "Network error — check your connection.";
      default: return code ? `Sign-in failed (${code}).` : "Sign-in failed. Please try again.";
    }
  };

  const go = (m: Mode) => { setMode(m); setError(""); setResetSent(false); };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      if (mode === "register") {
        if (password !== confirm) { setError("Passwords do not match."); return; }
        await signUpEmail(email, password, name);
      } else {
        await signInEmail(email, password);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      const msg = friendly(code);
      if (msg) setError(msg);
    } finally { setBusy(false); }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setBusy(true);
    try { await resetPassword(email); setResetSent(true); }
    catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      setError(code === "auth/user-not-found" ? "No account with that email." : "Could not send reset email.");
    } finally { setBusy(false); }
  };

  const handleGoogle = async () => {
    setError("");
    try {
      await signInGoogle();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      const msg = friendly(code);
      if (msg) setError(msg);
    }
  };

  const modeTitle    = mode === "register" ? "Create Account" : mode === "reset" ? "Reset Password" : title;
  const modeSubtitle = mode === "register" ? "Create your patient account to book consultations." : mode === "reset" ? "Enter your email and we'll send a reset link." : subtitle;

  return (
    <div className="signin-page">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div className="signin-card">
        <div className="brand-badge">
          <div className="icon">🩺</div>
          <h2>{modeTitle}</h2>
          <p className="subtitle">{modeSubtitle}</p>
        </div>

        {/* Reset sent */}
        {resetSent && (
          <div className="signin-success">
            <div className="success-icon">📬</div>
            <p style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>Check your inbox</p>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20, lineHeight: 1.5 }}>
              A password reset link was sent to <strong>{email}</strong>.
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => go("signin")}>← Back to Sign In</button>
          </div>
        )}

        {/* Reset form */}
        {!resetSent && mode === "reset" && (
          <form onSubmit={handleReset}>
            <div className="signin-field">
              <label>Email address</label>
              <div className="input-wrap">
                <input type="email" required autoComplete="email" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
              </div>
            </div>
            {error && <div className="signin-error">⚠️ {error}</div>}
            <button type="submit" className="btn btn-primary btn-signin" disabled={busy}>
              {busy ? <><Spinner /> Sending…</> : "📧 Send Reset Link"}
            </button>
            <div className="signin-footer">
              <button type="button" onClick={() => go("signin")}>← Back to Sign In</button>
            </div>
          </form>
        )}

        {/* Sign In / Register */}
        {!resetSent && (mode === "signin" || mode === "register") && (
          <>
            <button className="btn-google" onClick={handleGoogle} disabled={googleLoading} type="button">
              {googleLoading ? <><Spinner /> Signing in with Google…</> : <><GoogleLogo /><span>Continue with Google</span></>}
            </button>

            <div className="divider-or">or {mode === "register" ? "register" : "sign in"} with email</div>

            <form onSubmit={handleEmail}>
              {mode === "register" && (
                <div className="signin-field">
                  <label>Full name</label>
                  <div className="input-wrap">
                    <input type="text" required autoComplete="name" value={name}
                      onChange={e => setName(e.target.value)} placeholder="Your full name" />
                  </div>
                </div>
              )}
              <div className="signin-field">
                <label>Email address</label>
                <div className="input-wrap">
                  <input type="email" required autoComplete="email" value={email}
                    onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
                </div>
              </div>
              <div className="signin-field">
                <label>Password</label>
                <div className="input-wrap">
                  <input type={showPw ? "text" : "password"} required
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    value={password} onChange={e => setPassword(e.target.value)}
                    placeholder={mode === "register" ? "Min 6 characters" : "••••••••"}
                    minLength={mode === "register" ? 6 : undefined} />
                  <button type="button" className="eye-btn" onClick={() => setShowPw(v => !v)}
                    tabIndex={-1} aria-label={showPw ? "Hide" : "Show"}>
                    <EyeIcon open={showPw} />
                  </button>
                </div>
              </div>
              {mode === "register" && (
                <div className="signin-field">
                  <label>Confirm password</label>
                  <div className="input-wrap">
                    <input type={showPw ? "text" : "password"} required autoComplete="new-password"
                      value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" />
                  </div>
                </div>
              )}
              {/* Forgot password — directly under the password field, left-aligned, signin only */}
              {mode === "signin" && (
                <div style={{ marginTop: -6, marginBottom: 8, textAlign: "left" }}>
                  <button
                    type="button"
                    onClick={() => go("reset")}
                    style={{
                      background: "none", border: "none", padding: 0,
                      fontSize: 12.5, color: "var(--teal)", cursor: "pointer",
                      fontWeight: 600, fontFamily: "inherit",
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
              )}
              {error && <div className="signin-error">⚠️ {error}</div>}
              <button type="submit" className="btn btn-primary btn-signin" disabled={busy}>
                {busy
                  ? <><Spinner /> {mode === "register" ? "Creating…" : "Signing in…"}</>
                  : mode === "register" ? "🩺 Create Account" : "🔒 Sign In"}
              </button>
              <div className="signin-footer">
                {mode === "signin" ? (
                  <>
                    <button type="button" onClick={() => go("register")}>Create account</button>
                    <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
                      By signing in you agree to our{" "}
                      <a href="/privacy" target="_blank" rel="noopener" style={{ color: "var(--teal)", textDecoration: "underline", fontWeight: 600 }}>Privacy Policy</a>
                    </div>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => go("signin")}>Already have an account? Sign in</button>
                    <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
                      By registering you agree to our{" "}
                      <a href="/privacy" target="_blank" rel="noopener" style={{ color: "var(--teal)", textDecoration: "underline", fontWeight: 600 }}>Privacy Policy</a>
                    </div>
                  </>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
