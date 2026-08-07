"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Turnstile } from "@/components/Turnstile";

type Mode = "login" | "signup";
type Role = "candidate" | "hr";

const TURNSTILE_ENABLED = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [role, setRole] = useState<Role>(
    searchParams.get("role") === "hr" ? "hr" : "candidate",
  );
  // Candidates are invite-only (see /admin) - self-serve signup only applies to HR.
  const [mode, setMode] = useState<Mode>(
    searchParams.get("mode") === "signup" && searchParams.get("role") === "hr"
      ? "signup"
      : "login",
  );
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(
    searchParams.get("pending")
      ? {
          type: "error",
          text: "Almost there - your account is still being set up, try again in a moment.",
        }
      : null,
  );

  function handleRoleChange(next: Role) {
    setRole(next);
    if (next === "candidate") setMode("login");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSubmitting(true);

    try {
      if (mode === "signup") {
        if (!fullName.trim()) throw new Error("Please enter your full name.");
        if (!companyName.trim()) throw new Error("Please enter your company name.");
        if (TURNSTILE_ENABLED && !captchaToken) {
          throw new Error("Please complete the verification check.");
        }

        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: true,
            data: {
              role: "hr",
              full_name: fullName.trim(),
              company_name: companyName.trim(),
            },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
              searchParams.get("redirect") || "/portal",
            )}`,
            captchaToken: TURNSTILE_ENABLED ? captchaToken : undefined,
          },
        });
        if (error) throw error;
      } else {
        // Login (both roles): never auto-create an account here. Candidates
        // are invited by an admin; an unrecognized email should fail, not
        // silently register - that's the whole point of invite-only.
        if (TURNSTILE_ENABLED && !captchaToken) {
          throw new Error("Please complete the verification check.");
        }

        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
              searchParams.get("redirect") || "/portal",
            )}`,
            captchaToken: TURNSTILE_ENABLED ? captchaToken : undefined,
          },
        });
        if (error) throw error;
      }
      setSent(true);
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Something went wrong.",
      });
      setCaptchaToken("");
      window.turnstile?.reset();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setVerifying(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otpCode.trim(),
      type: "email",
    });
    setVerifying(false);
    if (error) {
      setMsg({ type: "error", text: error.message });
      return;
    }
    router.replace(searchParams.get("redirect") || "/portal");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 400, padding: 32 }}
      >
        <div className="logo" style={{ marginBottom: 22 }}>
          ~/<span>pritam</span>.mentor
        </div>

        {sent ? (
          <>
            <h1 style={{ fontFamily: "var(--mono)", fontSize: 19, marginBottom: 6 }}>
              Check your email
            </h1>
            <div className="muted" style={{ marginBottom: 22 }}>
              We sent a link and a 6-digit code to <b>{email}</b>. Click the link,
              or type the code below if the link doesn&apos;t work (e.g. opened on a
              different device or app).
            </div>
            <form onSubmit={handleVerifyCode}>
              <div className="field">
                <label htmlFor="otpCode">6-digit code</label>
                <input
                  id="otpCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  style={{ fontFamily: "var(--mono)", letterSpacing: 4, textAlign: "center" }}
                />
              </div>
              <button
                className="btn"
                type="submit"
                disabled={verifying || otpCode.trim().length < 6}
                style={{ width: "100%" }}
              >
                {verifying ? "Verifying..." : "Verify code →"}
              </button>
              {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
            </form>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily: "var(--mono)", fontSize: 19, marginBottom: 6 }}>
              {mode === "login" ? "Welcome back" : "Recruiter sign up"}
            </h1>
            <div className="muted" style={{ marginBottom: 22 }}>
              {mode === "login"
                ? "We'll email you a link to sign in - no password needed."
                : "Post jobs and browse candidates"}
            </div>

            <div
              className="tabs"
              style={{
                background: "var(--bg)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: 4,
              }}
            >
              <button
                type="button"
                className={`tabbtn ${role === "candidate" ? "active" : ""}`}
                style={{ flex: 1, textAlign: "center" }}
                onClick={() => handleRoleChange("candidate")}
              >
                Candidate
              </button>
              <button
                type="button"
                className={`tabbtn ${role === "hr" ? "active" : ""}`}
                style={{ flex: 1, textAlign: "center" }}
                onClick={() => handleRoleChange("hr")}
              >
                HR / Recruiter
              </button>
            </div>

            {role === "hr" && (
              <div
                className="tabs"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: 4,
                }}
              >
                <button
                  type="button"
                  className={`tabbtn ${mode === "login" ? "active" : ""}`}
                  style={{ flex: 1, textAlign: "center" }}
                  onClick={() => setMode("login")}
                >
                  Log in
                </button>
                <button
                  type="button"
                  className={`tabbtn ${mode === "signup" ? "active" : ""}`}
                  style={{ flex: 1, textAlign: "center" }}
                  onClick={() => setMode("signup")}
                >
                  Sign up
                </button>
              </div>
            )}

            {role === "candidate" && (
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
                Candidate accounts are set up by invitation after applying -{" "}
                <a href="/index.html#apply" style={{ color: "var(--amber)" }}>
                  join the waitlist
                </a>{" "}
                if you don&apos;t have one yet.
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {mode === "signup" && (
                <>
                  <div className="field">
                    <label htmlFor="fullName">Full name</label>
                    <input
                      id="fullName"
                      type="text"
                      autoComplete="name"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="companyName">Company name</label>
                    <input
                      id="companyName"
                      type="text"
                      autoComplete="organization"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>
                </>
              )}
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {TURNSTILE_ENABLED && <Turnstile onVerify={setCaptchaToken} />}
              <button
                className="btn"
                type="submit"
                disabled={submitting || (TURNSTILE_ENABLED && !captchaToken)}
                style={{ width: "100%", marginTop: 6 }}
              >
                {mode === "login" ? "Send sign-in link →" : "Create account →"}
              </button>
              {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
            </form>
          </>
        )}

        <a
          href="/index.html"
          className="logout"
          style={{ display: "block", textAlign: "center", marginTop: 18 }}
        >
          ← back to site
        </a>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
