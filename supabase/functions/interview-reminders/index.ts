// Cron-invoked. Two jobs:
//  1) Reminders: email the candidate ~1h before a scheduled interview (once).
//  2) Missed: interviews still "scheduled" >20min after their time are marked
//     "no_show" and the candidate is emailed to rebook.
// Slack-alerts the admin for both. Auth via the scheduler internal secret.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function istLabel(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso)) + " IST";
}

Deno.serve(async (req) => {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const getSecret = async (name: string) => {
      const { data } = await svc.rpc("read_vault_secret", { p_name: name });
      return data as string | null;
    };

    const internal = req.headers.get("x-internal-secret");
    if (!internal || internal !== (await getSecret("scheduler_internal_secret"))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("NUDGE_FROM_EMAIL") || "noreply@pritamkamble.com";
    const siteUrl = Deno.env.get("SITE_URL") || "https://pritamkamble.com";
    // Prefer a dedicated interview Slack channel; fall back to the waitlist one.
    const slackHook =
      (await getSecret("slack_interview_webhook_url")) ||
      (await getSecret("slack_waitlist_webhook_url"));
    const now = Date.now();

    const email = async (to: string, subject: string, html: string) => {
      if (!resendKey || !to) return;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `Pritam Mentor <${fromEmail}>`, to, subject, html }),
      });
    };
    const slack = async (text: string) => {
      if (!slackHook) return;
      await fetch(slackHook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    };

    // --- 1) Reminders (~1h before, once) ------------------------------------
    const { data: soon } = await svc
      .from("interviews")
      .select("id, scheduled_at, meeting_link, profiles!interviews_candidate_id_fkey(full_name, email)")
      .eq("status", "scheduled")
      .is("reminder_sent_at", null)
      .gte("scheduled_at", new Date(now).toISOString())
      .lte("scheduled_at", new Date(now + 65 * 60000).toISOString());
    let reminded = 0;
    for (const iv of soon ?? []) {
      const p = (iv as unknown as { profiles: { full_name: string; email: string } }).profiles;
      const when = istLabel(iv.scheduled_at as string);
      await email(
        p?.email,
        `Reminder: your mock interview is at ${when}`,
        `<p>Hi ${p?.full_name ?? "there"},</p><p>Your mock interview is coming up at <b>${when}</b>.</p>` +
          (iv.meeting_link ? `<p>Join here: <a href="${iv.meeting_link}">${iv.meeting_link}</a></p>` : "") +
          `<p>See you soon!</p>`,
      );
      await svc.from("interviews").update({ reminder_sent_at: new Date().toISOString() }).eq("id", iv.id);
      await slack(`:alarm_clock: Reminder sent to *${p?.full_name ?? p?.email}* for their mock at ${when}.`);
      reminded++;
    }

    // --- 2) Missed -> no_show + rebook email --------------------------------
    const { data: missed } = await svc
      .from("interviews")
      .select("id, scheduled_at, profiles!interviews_candidate_id_fkey(full_name, email)")
      .eq("status", "scheduled")
      .lt("scheduled_at", new Date(now - 20 * 60000).toISOString());
    let missedCount = 0;
    for (const iv of missed ?? []) {
      const p = (iv as unknown as { profiles: { full_name: string; email: string } }).profiles;
      const when = istLabel(iv.scheduled_at as string);
      await svc.from("interviews").update({ status: "no_show" }).eq("id", iv.id);
      await email(
        p?.email,
        "You missed your mock interview — let's rebook",
        `<p>Hi ${p?.full_name ?? "there"},</p><p>Looks like your mock interview on <b>${when}</b> was missed.</p>` +
          `<p>No worries — head to your <a href="${siteUrl}/candidate">candidate portal</a> to pick a new time.</p>`,
      );
      await slack(`:warning: *${p?.full_name ?? p?.email}* missed their mock (${when}) — marked no-show and emailed to rebook.`);
      missedCount++;
    }

    return new Response(JSON.stringify({ reminded, missed: missedCount }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500 });
  }
});
