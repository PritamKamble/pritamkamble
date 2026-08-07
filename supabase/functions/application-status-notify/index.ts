import { createClient } from "jsr:@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("NUDGE_FROM_EMAIL") || "noreply@pritamkamble.com";
const SITE_URL = Deno.env.get("SITE_URL") || "https://pritamkamble.com";

const STATUS_COPY: Record<string, string> = {
  shortlisted: "You've been shortlisted",
  rejected: "Update on your application",
  hired: "Great news — you got the role!",
};

const BODY_COPY: Record<string, (title: string, company: string) => string> = {
  shortlisted: (title, company) =>
    `Good news — you've been shortlisted for <b>${title}</b> at <b>${company}</b>. The team will be in touch about next steps.`,
  rejected: (title, company) =>
    `Thanks for applying to <b>${title}</b> at <b>${company}</b>. The team has decided to move forward with other candidates this time. Keep going — new roles are posted regularly.`,
  hired: (title, company) =>
    `You got the role! <b>${company}</b> has selected you for <b>${title}</b>. Congratulations — reach out to your mentor to plan next steps.`,
};

Deno.serve(async (req: Request) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const applicationId = body?.application_id;
  if (!applicationId) {
    return new Response(JSON.stringify({ error: "missing application_id" }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: app, error } = await supabase
    .from("job_applications")
    .select("status, jobs(title, company), profiles(full_name, email)")
    .eq("id", applicationId)
    .single();

  if (error || !app) {
    return new Response(JSON.stringify({ error: error?.message || "not found" }), { status: 404 });
  }

  const status = app.status as string;
  const job = app.jobs as unknown as { title: string; company: string } | null;
  const candidate = app.profiles as unknown as { full_name: string; email: string } | null;

  if (!candidate?.email || !STATUS_COPY[status]) {
    return new Response(JSON.stringify({ skipped: true }), { headers: { "Content-Type": "application/json" } });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: candidate.email,
      subject: `${STATUS_COPY[status]}: ${job?.title || "your application"}`,
      html: `<p>Hi ${candidate.full_name || "there"},</p>` +
        `<p>${BODY_COPY[status](job?.title || "the role", job?.company || "the company")}</p>` +
        `<p><a href="${SITE_URL}/candidate">View your applications →</a></p>` +
        `<p style="color:#888;font-size:12px">This is an automated notification from Pritam Mentor.</p>`,
    }),
  });

  const sent = res.ok;
  return new Response(JSON.stringify({ sent, status: res.status }), { headers: { "Content-Type": "application/json" } });
});
