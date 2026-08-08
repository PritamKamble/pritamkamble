import { createClient } from "jsr:@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("NUDGE_FROM_EMAIL") || "noreply@pritamkamble.com";
const SITE_URL = Deno.env.get("SITE_URL") || "https://pritamkamble.com";

function emailShell(preheader: string, bodyHtml: string): string {
  return `<div style="background:#f4f4f2; padding:32px 16px; font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
  <div style="max-width:460px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e5e0;">
    <div style="background:#0E1210; padding:20px 28px;">
      <span style="font-family:'Courier New',monospace; color:#8B9690; font-size:14px;">~/</span><span style="font-family:'Courier New',monospace; color:#5FBF77; font-size:14px; font-weight:700;">pritam</span><span style="font-family:'Courier New',monospace; color:#EDEFEA; font-size:14px; font-weight:700;">.mentor</span>
    </div>
    <div style="padding:32px 28px; color:#333;">${bodyHtml}</div>
  </div>
</div>`;
}

function emailButton(href: string, label: string): string {
  return `<div style="text-align:center; margin-top:12px;"><a href="${href}" style="display:inline-block; background:#5FBF77; color:#0B140E; text-decoration:none; font-weight:700; font-size:14px; padding:13px 28px; border-radius:6px;">${label}</a></div>`;
}

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

  // Employer follow-ups due today or earlier.
  const todayStr = today.toISOString().slice(0, 10);
  const { data: overdueFollowUps } = await supabase
    .from("profiles")
    .select("full_name, company_name, follow_up_due")
    .eq("role", "hr")
    .lte("follow_up_due", todayStr)
    .not("follow_up_due", "is", null)
    .order("follow_up_due", { ascending: true });

  if (
    missedYesterday.length === 0 &&
    (staleApplicants || []).length === 0 &&
    (upcomingInterviews || []).length === 0 &&
    (overdueFollowUps || []).length === 0
  ) {
    return new Response(JSON.stringify({ skipped: true, reason: "nothing to report" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: admins } = await supabase.from("profiles").select("email").eq("role", "admin");

  const sections: string[] = [];
  const textSections: string[] = [];
  if (missedYesterday.length > 0) {
    sections.push(
      `<h3 style="margin:16px 0 6px; font-size:14px; color:#111;">Missed logging yesterday (${missedYesterday.length})</h3><ul style="margin:0; padding-left:20px; font-size:13.5px;">` +
        missedYesterday.map((c) => `<li>${c.full_name || "Unnamed"}</li>`).join("") +
        `</ul>`,
    );
    textSections.push(
      `Missed logging yesterday (${missedYesterday.length}):\n` +
        missedYesterday.map((c) => `- ${c.full_name || "Unnamed"}`).join("\n"),
    );
  }
  if ((staleApplicants || []).length > 0) {
    sections.push(
      `<h3 style="margin:16px 0 6px; font-size:14px; color:#111;">Waiting 5+ days, not yet contacted (${staleApplicants!.length})</h3><ul style="margin:0; padding-left:20px; font-size:13.5px;">` +
        staleApplicants!
          .map((a) => `<li>${a.name} - applied ${new Date(a.created_at).toDateString()}</li>`)
          .join("") +
        `</ul>`,
    );
    textSections.push(
      `Waiting 5+ days, not yet contacted (${staleApplicants!.length}):\n` +
        staleApplicants!.map((a) => `- ${a.name} - applied ${new Date(a.created_at).toDateString()}`).join("\n"),
    );
  }
  if ((upcomingInterviews || []).length > 0) {
    sections.push(
      `<h3 style="margin:16px 0 6px; font-size:14px; color:#111;">Interviews in the next 24h (${upcomingInterviews!.length})</h3><ul style="margin:0; padding-left:20px; font-size:13.5px;">` +
        upcomingInterviews!
          .map((i) => {
            const name = (i.profiles as unknown as { full_name: string } | null)?.full_name || "Unknown";
            return `<li>${name} - ${new Date(i.scheduled_at).toLocaleString()}</li>`;
          })
          .join("") +
        `</ul>`,
    );
    textSections.push(
      `Interviews in the next 24h (${upcomingInterviews!.length}):\n` +
        upcomingInterviews!
          .map((i) => {
            const name = (i.profiles as unknown as { full_name: string } | null)?.full_name || "Unknown";
            return `- ${name} - ${new Date(i.scheduled_at).toLocaleString()}`;
          })
          .join("\n"),
    );
  }

  if ((overdueFollowUps || []).length > 0) {
    sections.push(
      `<h3 style="margin:16px 0 6px; font-size:14px; color:#111;">Employer follow-ups due (${overdueFollowUps!.length})</h3><ul style="margin:0; padding-left:20px; font-size:13.5px;">` +
        overdueFollowUps!
          .map((f) => `<li>${f.company_name || f.full_name || "Unknown"} - due ${f.follow_up_due}</li>`)
          .join("") +
        `</ul>`,
    );
    textSections.push(
      `Employer follow-ups due (${overdueFollowUps!.length}):\n` +
        overdueFollowUps!.map((f) => `- ${f.company_name || f.full_name || "Unknown"} - due ${f.follow_up_due}`).join("\n"),
    );
  }

  const itemCount =
    missedYesterday.length + (staleApplicants || []).length + (upcomingInterviews || []).length +
    (overdueFollowUps || []).length;
  const preheader = `${itemCount} item${itemCount === 1 ? "" : "s"} need your attention today.`;

  const html = emailShell(
    preheader,
    `<h1 style="margin:0 0 16px; font-size:20px; color:#111;">Daily digest</h1>` +
      sections.join("") +
      emailButton(`${SITE_URL}/admin`, "Open admin panel →"),
  );
  const text = `Daily digest - Pritam Mentor\n\n${textSections.join("\n\n")}\n\nOpen admin panel: ${SITE_URL}/admin`;

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
          html,
          text,
        }),
      });
      if (res.ok) sent++;
      else failures.push(`${admin.email}: ${res.status}`);
    } catch (e) {
      failures.push(`${admin.email}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  return new Response(
    JSON.stringify({
      missedYesterday: missedYesterday.length,
      staleApplicants: (staleApplicants || []).length,
      upcomingInterviews: (upcomingInterviews || []).length,
      overdueFollowUps: (overdueFollowUps || []).length,
      sent,
      failures,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
