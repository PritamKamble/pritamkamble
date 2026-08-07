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

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  // Candidates who have logged at least once before, but missed yesterday.
  const { data: candidates } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "candidate");

  const { data: everLogged } = await supabase
    .from("daily_logs")
    .select("candidate_id")
    .lte("log_date", yesterdayStr);
  const everLoggedIds = new Set((everLogged || []).map((r) => r.candidate_id));

  const { data: loggedYesterday } = await supabase
    .from("daily_logs")
    .select("candidate_id")
    .eq("log_date", yesterdayStr);
  const loggedYesterdayIds = new Set((loggedYesterday || []).map((r) => r.candidate_id));

  const missedYesterday = (candidates || []).filter(
    (c) => everLoggedIds.has(c.id) && !loggedYesterdayIds.has(c.id),
  );

  // Applicants waiting more than 5 days with no status change.
  const fiveDaysAgo = new Date(today);
  fiveDaysAgo.setUTCDate(fiveDaysAgo.getUTCDate() - 5);
  const { data: staleApplicants } = await supabase
    .from("applicants")
    .select("name, created_at")
    .eq("status", "waiting")
    .lt("created_at", fiveDaysAgo.toISOString())
    .order("created_at", { ascending: true });

  // Upcoming interviews in the next 24 hours.
  const in24h = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const { data: upcomingInterviews } = await supabase
    .from("interviews")
    .select("scheduled_at, profiles(full_name)")
    .eq("status", "scheduled")
    .gte("scheduled_at", today.toISOString())
    .lte("scheduled_at", in24h.toISOString());

  if (missedYesterday.length === 0 && (staleApplicants || []).length === 0 && (upcomingInterviews || []).length === 0) {
    return new Response(JSON.stringify({ skipped: true, reason: "nothing to report" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: admins } = await supabase.from("profiles").select("email").eq("role", "admin");

  const sections: string[] = [];
  if (missedYesterday.length > 0) {
    sections.push(
      `<h3 style="margin:16px 0 6px;">Missed logging yesterday (${missedYesterday.length})</h3><ul>` +
        missedYesterday.map((c) => `<li>${c.full_name || "Unnamed"}</li>`).join("") +
        `</ul>`,
    );
  }
  if ((staleApplicants || []).length > 0) {
    sections.push(
      `<h3 style="margin:16px 0 6px;">Waiting 5+ days, not yet contacted (${staleApplicants!.length})</h3><ul>` +
        staleApplicants!
          .map((a) => `<li>${a.name} - applied ${new Date(a.created_at).toDateString()}</li>`)
          .join("") +
        `</ul>`,
    );
  }
  if ((upcomingInterviews || []).length > 0) {
    sections.push(
      `<h3 style="margin:16px 0 6px;">Interviews in the next 24h (${upcomingInterviews!.length})</h3><ul>` +
        upcomingInterviews!
          .map((i) => {
            const name = (i.profiles as unknown as { full_name: string } | null)?.full_name || "Unknown";
            return `<li>${name} - ${new Date(i.scheduled_at).toLocaleString()}</li>`;
          })
          .join("") +
        `</ul>`,
    );
  }

  let sent = 0;
  const failures: string[] = [];
  for (const admin of admins || []) {
    if (!admin.email) continue;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: admin.email,
          subject: "Daily digest - Pritam Mentor",
          html: `<div style="font-family:sans-serif;">${sections.join("")}` +
            `<p style="margin-top:20px;"><a href="${SITE_URL}/admin">Open admin panel →</a></p></div>`,
        }),
      });
      if (res.ok) sent++;
      else failures.push(`${admin.email}: ${res.status}`);
    } catch (e) {
      failures.push(`${admin.email}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  return new Response(
    JSON.stringify({ missedYesterday: missedYesterday.length, staleApplicants: (staleApplicants || []).length, upcomingInterviews: (upcomingInterviews || []).length, sent, failures }),
    { headers: { "Content-Type": "application/json" } },
  );
});
