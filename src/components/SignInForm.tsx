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

type Mode = "signin" | "register" | "reset";

interface Props {
  title?: string;
  subtitle?: string;
}

export default function SignInForm({ title = "Sign In", subtitle = "Enter your credentials to continue." }: Props) {
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
      case "auth/email-already-in-use":  return "An account with this email already exists. Sign in instead.";
      case "auth/weak-password":         return "Password must be at least 6 characters.";
      case "auth/invalid-email":         return "Please enter a valid email address.";
      case "auth/too-many-requests":     return "Too many attempts — try again later.";
      case "auth/user-disabled":         return "This account has been disabled.";
      case "auth/network-request-failed":return "Network error — check your connection.";
      case "auth/unauthorized-domain":   return "This domain is not authorised in Firebase. Contact support.";
      case "auth/operation-not-allowed": return "Google sign-in is not enabled. Contact support.";
      default:                           return `Sign-in failed (${code || "unknown"}). Please try again.`;
    }
  };

  const go = (m: Mode) => { setMode(m); setError(""); setResetSent(false); };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      if (mode === "register") {
        if (password !== confirm) { setError("Passwords do not match."); setBusy(false); return; }
        await signUpEmail(email, password, name);
      } else {
        await signInEmail(email, password);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      console.error("[Email auth]", code, err);
      setError(friendly(code));
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
    setBusy(true);
    try {
      await signInGoogle();
      // Page will redirect to Google — no need to reset busy
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      console.error("[Google auth]", code, err);
      setError(friendly(code));
      setBusy(false);
    }
  };

  // If we just returned from the Google redirect, show a loading screen
  if (googleLoading) {
    return (
      <div className="signin-page">
        <div className="signin-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 16 }}>🩺</div>
          <h2 style={{ marginBottom: 8 }}>Signing you in…</h2>
          <p className="subtitle">Completing Google sign-in, please wait.</p>
          <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              border: "3px solid var(--teal)",
              borderTopColor: "transparent",
              animation: "spin 0.7s linear infinite",
            }} />
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const modeTitle    = mode === "register" ? "Create Account" : mode === "reset" ? "Reset Password" : title;
  const modeSubtitle = mode === "register" ? "Create your patient account to book consultations." : mode === "reset" ? "Enter your email and we'll send a reset link." : subtitle;

  return (
    <div className="signin-page">
      <div className="signin-card">
        <div className="brand-badge">
          <div className="icon">🩺</div>
          <h2>{modeTitle}</h2>
          <p className="subtitle">{modeSubtitle}</p>
        </div>

        {/* ── Reset sent ── */}
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

        {/* ── Reset form ── */}
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
              {busy ? "Sending…" : "📧 Send Reset Link"}
            </button>
            <div className="signin-footer">
              <button type="button" onClick={() => go("signin")}>← Back to Sign In</button>
            </div>
          </form>
        )}

        {/* ── Sign In / Register ── */}
        {!resetSent && (mode === "signin" || mode === "register") && (
          <>
            {/* Google button */}
            <button className="btn-google" onClick={handleGoogle} disabled={busy || googleLoading} type="button">
              {busy ? (
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    display: "inline-block", width: 16, height: 16, borderRadius: "50%",
                    border: "2px solid #4285F4", borderTopColor: "transparent",
                    animation: "spin 0.7s linear infinite",
                  }} />
                  Redirecting to Google…
                </span>
              ) : (
                <><GoogleLogo /><span>Continue with Google</span></>
              )}
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
                    tabIndex={-1} aria-label={showPw ? "Hide password" : "Show password"}>
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

              {error && <div className="signin-error">⚠️ {error}</div>}

              <button type="submit" className="btn btn-primary btn-signin" disabled={busy}>
                {busy
                  ? (mode === "register" ? "Creating account…" : "Signing in…")
                  : (mode === "register" ? "🩺 Create Account" : "🔒 Sign In")
                }
              </button>

              <div className="signin-footer">
                {mode === "signin" ? (
                  <>
                    <button type="button" onClick={() => go("reset")}>Forgot password?</button>
                    <span style={{ margin: "0 8px", color: "var(--line)" }}>|</span>
                    <button type="button" onClick={() => go("register")}>Create account</button>
                  </>
                ) : (
                  <button type="button" onClick={() => go("signin")}>Already have an account? Sign in</button>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
