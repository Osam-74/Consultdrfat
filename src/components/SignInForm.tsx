"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";

export default function SignInForm() {
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [resetSent, setResetSent] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError("Incorrect email or password.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts — try again later or reset your password.");
      } else if (code === "auth/user-disabled") {
        setError("This account has been disabled.");
      } else {
        setError("Sign-in failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/user-not-found") {
        setError("No account found with that email.");
      } else {
        setError("Could not send reset email. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", display: "flex", flexDirection: "column" }}>
      <div className="wrap">
        <nav className="nav">
          <div className="brand">
            <div className="brand-icon">🩺</div>
            <div className="brand-text"><span>ConsultDrFat</span><small>Practitioner Portal</small></div>
          </div>
        </nav>
      </div>

      <div className="center" style={{ flex: 1 }}>
        <div style={{
          background: "#fff",
          border: "1px solid var(--line)",
          borderRadius: 20,
          padding: "40px 36px",
          maxWidth: 400,
          width: "100%",
          boxShadow: "var(--shadow-sm)",
        }}>
          <div style={{ fontSize: 48, textAlign: "center", marginBottom: 8 }}>👨‍⚕️</div>
          <h2 style={{ textAlign: "center", marginBottom: 4 }}>
            {mode === "signin" ? "Practitioner Sign In" : "Reset Password"}
          </h2>
          <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 14, marginBottom: 24 }}>
            {mode === "signin"
              ? "Enter your credentials to access the dashboard."
              : "We'll send a reset link to your email."}
          </p>

          {resetSent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📬</div>
              <p style={{ color: "var(--navy)", fontWeight: 600, marginBottom: 8 }}>Check your inbox</p>
              <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 20 }}>
                A password reset link has been sent to <strong>{email}</strong>.
              </p>
              <button className="btn btn-ghost btn-sm" onClick={() => { setMode("signin"); setResetSent(false); }}>
                ← Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={mode === "signin" ? handleSignIn : handleReset}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>

              {mode === "signin" && (
                <div style={{ marginBottom: 18, position: "relative" }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    Password
                  </label>
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{ width: "100%", boxSizing: "border-box", paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    style={{
                      position: "absolute", right: 12, bottom: 10,
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--muted)", fontSize: 14, padding: 0,
                    }}
                  >
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
              )}

              {error && (
                <p style={{
                  color: "#c0392b", fontSize: 13, marginBottom: 14,
                  background: "#fdf0ef", borderRadius: 8, padding: "8px 12px",
                }}>
                  ⚠️ {error}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy}
                style={{ width: "100%", justifyContent: "center", marginBottom: 14 }}
              >
                {busy
                  ? (mode === "signin" ? "Signing in…" : "Sending…")
                  : (mode === "signin" ? "🔒 Sign In" : "📧 Send Reset Link")}
              </button>

              <div style={{ textAlign: "center" }}>
                {mode === "signin" ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setMode("reset"); setError(""); }}
                  >
                    Forgot password?
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setMode("signin"); setError(""); }}
                  >
                    ← Back to Sign In
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
