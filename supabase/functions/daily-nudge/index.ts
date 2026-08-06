import { createClient } from "jsr:@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("NUDGE_FROM_EMAIL") || "noreply@pritamkamble.com";
const SITE_URL = Deno.env.get("SITE_URL") || "https://pritamkamble.com";

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
          html: `<p>Hi ${c.full_name || "there"},</p>` +
            `<p>You haven't submitted your daily log yet today. Missed days can't be filled in later, ` +
            `and it counts toward your job readiness score.</p>` +
            `<p><a href="${SITE_URL}/candidate">Log today's progress →</a></p>` +
            `<p style="color:#888;font-size:12px">This is an automated reminder from Pritam Mentor.</p>`,
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
