"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "ok"; text: string } | null>(
    null,
  );

  useEffect(() => {
    (async () => {
      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setMsg({ type: "error", text: error.message });
          return;
        }
        setReady(true);
        return;
      }
      // Fallback for the older implicit flow (#access_token=...&type=recovery)
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setReady(true);
      } else {
        setMsg({
          type: "error",
          text: "This reset link is invalid or has expired. Request a new one from the login page.",
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 6) {
      setMsg({ type: "error", text: "Password must be at least 6 characters." });
      return;
    }
    if (password !== confirm) {
      setMsg({ type: "error", text: "Passwords don't match." });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMsg({ type: "error", text: error.message });
      setSubmitting(false);
      return;
    }
    setMsg({ type: "ok", text: "Password updated. Redirecting..." });
    setTimeout(() => router.push("/portal"), 1000);
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
      <div className="card" style={{ width: "100%", maxWidth: 400, padding: 32 }}>
        <div className="logo" style={{ marginBottom: 22 }}>
          ~/<span>pritam</span>.mentor
        </div>
        <h1 style={{ fontFamily: "var(--mono)", fontSize: 19, marginBottom: 6 }}>
          Set a new password
        </h1>
        <div className="muted" style={{ marginBottom: 22 }}>
          Choose a new password for your account
        </div>

        {ready ? (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="password">New password</label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="confirm">Confirm password</label>
              <input
                id="confirm"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <button
              className="btn"
              type="submit"
              disabled={submitting}
              style={{ width: "100%", marginTop: 6 }}
            >
              Update password →
            </button>
          </form>
        ) : (
          !msg && <div className="muted">Verifying link...</div>
        )}

        {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}

        <a
          href="/login"
          className="logout"
          style={{ display: "block", textAlign: "center", marginTop: 18 }}
        >
          ← back to login
        </a>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
