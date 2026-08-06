"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function friendlyError(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("expired") || lower.includes("invalid")
    ? "This link has expired or was already used. Request a new one from the login page."
    : message;
}

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const next = searchParams.get("next") || "/portal";
      const code = searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setError(friendlyError(error.message));
          return;
        }
        router.replace(next);
        return;
      }

      // Admin-generated links (invites) use the implicit flow - tokens
      // arrive in the URL hash, not the query string, since there's no
      // browser-side PKCE challenge to pair them with.
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          setError(friendlyError(error.message));
          return;
        }
        router.replace(next);
        return;
      }

      setError("This link is invalid or missing a code. Request a new one from the login page.");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <div className="card" style={{ width: "100%", maxWidth: 400, padding: 32, textAlign: "center" }}>
        <div className="logo" style={{ marginBottom: 22 }}>
          ~/<span>pritam</span>.mentor
        </div>
        {error ? (
          <>
            <div className="msg error">{error}</div>
            <a
              href="/login"
              className="logout"
              style={{ display: "block", textAlign: "center", marginTop: 18 }}
            >
              ← back to login
            </a>
          </>
        ) : (
          <p className="muted" style={{ fontFamily: "var(--mono)" }}>
            Signing you in...
          </p>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackInner />
    </Suspense>
  );
}
