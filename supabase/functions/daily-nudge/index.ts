import { createClient } from "jsr:@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("NUDGE_FROM_EMAIL") || "noreply@pritamkamble.com";
const SITE_URL = Deno.env.get("SITE_URL") || "https://pritamkamble.com";

function emailShell(preheader: string, bodyHtml: string): string {
  return `<div style="background:#f4f4f2; padding:32px 16px; font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
  <div style="max-width:420px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e5e0;">
    <div style="background:#0E1210; padding:20px 28px;">
      <span style="font-family:'Courier New',monospace; color:#8B9690; font-size:14px;">~/</span><span style="font-family:'Courier New',monospace; color:#5FBF77; font-size:14px; font-weight:700;">pritam</span><span style="font-family:'Courier New',monospace; color:#EDEFEA; font-size:14px; font-weight:700;">.mentor</span>
    </div>
    <div style="padding:32px 28px;">${bodyHtml}</div>
  </div>
</div>`;
}

function emailButton(href: string, label: string): string {
  return `<div style="text-align:center; margin-bottom:8px;"><a href="${href}" style="display:inline-block; background:#5FBF77; color:#0B140E; text-decoration:none; font-weight:700; font-size:14px; padding:13px 28px; border-radius:6px;">${label}</a></div>`;
}

Deno.serve(async (req: Request) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date().toISOString().slice(0, 10);

  const { data: candidates, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "candidate");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const { data: loggedToday } = await supabase
    .from("daily_logs")
    .select("candidate_id")
    .eq("log_date", today);

  const loggedIds = new Set((loggedToday || []).map((r) => r.candidate_id));
  const toNudge = (candidates || []).filter((c) => !loggedIds.has(c.id));

  let sent = 0;
  const failures: string[] = [];

  for (const c of toNudge) {
    if (!c.email) continue;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: c.email,
          subject: "You haven't logged today yet",
          html: emailShell(
            "Missed days can't be filled in later — takes 2 minutes.",
            `<h1 style="margin:0 0 12px; font-size:20px; color:#111;">You haven't logged today yet</h1>` +
              `<p style="margin:0 0 24px; font-size:14.5px; line-height:1.6; color:#555;">Hi ${c.full_name || "there"}, you haven't submitted your daily log yet today. Missed days can't be filled in later, and it counts toward your job readiness score.</p>` +
              emailButton(`${SITE_URL}/candidate`, "Log today's progress →") +
              `<p style="margin:24px 0 0; font-size:12px; color:#999; text-align:center;">This is an automated reminder from Pritam Mentor.</p>`,
          ),
          text: `Hi ${c.full_name || "there"},\n\nYou haven't submitted your daily log yet today. Missed days can't be filled in later, and it counts toward your job readiness score.\n\nLog today's progress: ${SITE_URL}/candidate\n\n— Pritam Mentor`,
        }),
      });
      if (res.ok) {
        sent++;
      } else {
        failures.push(`${c.email}: ${res.status}`);
      }
    } catch (e) {
      failures.push(`${c.email}: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  return new Response(
    JSON.stringify({ candidatesChecked: (candidates || []).length, nudged: toNudge.length, sent, failures }),
    { headers: { "Content-Type": "application/json" } },
  );
});
