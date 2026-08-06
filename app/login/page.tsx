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

  const [mode, setMode] = useState<Mode>(
    searchParams.get("mode") === "signup" ? "signup" : "login",
  );
  const [role, setRole] = useState<Role>(
    searchParams.get("role") === "hr" ? "hr" : "candidate",
  );
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(
    searchParams.get("pending")
      ? {
          type: "error",
          text: "Almost there - your account is still being set up, try signing in again in a moment.",
        }
      : null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSubmitting(true);

    try {
      if (mode === "signup") {
        if (!fullName.trim()) throw new Error("Please enter your full name.");
        if (role === "hr" && !companyName.trim()) {
          throw new Error("Please enter your company name.");
        }

        if (TURNSTILE_ENABLED && !captchaToken) {
          throw new Error("Please complete the verification check.");
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role,
              full_name: fullName.trim(),
              company_name: role === "hr" ? companyName.trim() : null,
            },
            captchaToken: TURNSTILE_ENABLED ? captchaToken : undefined,
          },
        });
        if (error) throw error;
        setMsg({ type: "ok", text: "Account created! Redirecting..." });
        setTimeout(() => {
          router.push(searchParams.get("redirect") || "/portal");
        }, 1000);
      } else {
        if (TURNSTILE_ENABLED && !captchaToken) {
          throw new Error("Please complete the verification check.");
        }

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken: TURNSTILE_ENABLED ? captchaToken : undefined },
        });
        if (error) throw error;
        router.push(searchParams.get("redirect") || "/portal");
      }
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Something went wrong.",
      });
      setSubmitting(false);
      setCaptchaToken("");
      window.turnstile?.reset();
    }
  }

  async function handleForgotPassword() {
    setMsg(null);
    if (!email.trim()) {
      setMsg({ type: "error", text: "Enter your email above first." });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo:
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined,
    });
    if (error) {
      setMsg({ type: "error", text: error.message });
      return;
    }
    setMsg({ type: "ok", text: "Check your email for a reset link." });
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
        <h1 style={{ fontFamily: "var(--mono)", fontSize: 19, marginBottom: 6 }}>
          {mode === "login"
            ? "Welcome back"
            : role === "hr"
              ? "Recruiter sign up"
              : "Candidate sign up"}
        </h1>
        <div className="muted" style={{ marginBottom: 22 }}>
          {mode === "login"
            ? "Log in to your account"
            : role === "hr"
              ? "Post jobs and browse candidates"
              : "Track progress and apply to jobs"}
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
          <div
            className={`tabbtn ${mode === "login" ? "active" : ""}`}
            style={{ flex: 1, textAlign: "center" }}
            onClick={() => setMode("login")}
          >
            Log in
          </div>
          <div
            className={`tabbtn ${mode === "signup" ? "active" : ""}`}
            style={{ flex: 1, textAlign: "center" }}
            onClick={() => setMode("signup")}
          >
            Sign up
          </div>
        </div>

        <div className="tabs">
          <div
            className={`tabbtn ${role === "candidate" ? "active" : ""}`}
            style={{ flex: 1, textAlign: "center" }}
            onClick={() => setRole("candidate")}
          >
            Candidate
          </div>
          <div
            className={`tabbtn ${role === "hr" ? "active" : ""}`}
            style={{ flex: 1, textAlign: "center" }}
            onClick={() => setRole("hr")}
          >
            HR / Recruiter
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div className="field">
              <label htmlFor="fullName">Full name</label>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          )}
          {mode === "signup" && role === "hr" && (
            <div className="field">
              <label htmlFor="companyName">Company name</label>
              <input
                id="companyName"
                type="text"
                autoComplete="organization"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
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
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {TURNSTILE_ENABLED && <Turnstile onVerify={setCaptchaToken} />}
          <button
            className="btn"
            type="submit"
            disabled={submitting || (TURNSTILE_ENABLED && !captchaToken)}
            style={{ width: "100%", marginTop: 6 }}
          >
            {mode === "login" ? "Log in →" : "Create account →"}
          </button>
          {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
        </form>

        {mode === "login" && (
          <button
            type="button"
            onClick={handleForgotPassword}
            className="logout"
            style={{ display: "block", width: "100%", textAlign: "center", marginTop: 14 }}
          >
            Forgot password?
          </button>
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
