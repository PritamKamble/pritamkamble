"use client";

import Script from "next/script";
import { useId } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: { sitekey: string; callback: (token: string) => void; "error-callback"?: () => void; "expired-callback"?: () => void },
      ) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

export function Turnstile({ onVerify }: { onVerify: (token: string) => void }) {
  const id = useId().replace(/:/g, "");

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onReady={() => {
          window.turnstile?.render(`#turnstile-${id}`, {
            sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!,
            callback: onVerify,
          });
        }}
      />
      <div id={`turnstile-${id}`} style={{ margin: "14px 0" }} />
    </>
  );
}
