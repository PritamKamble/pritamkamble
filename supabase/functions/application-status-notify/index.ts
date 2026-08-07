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
      html: emailShell(
        STATUS_COPY[status],
        `<h1 style="margin:0 0 12px; font-size:20px; color:#111;">${STATUS_COPY[status]}</h1>` +
          `<p style="margin:0 0 8px; font-size:14.5px; line-height:1.6; color:#555;">Hi ${candidate.full_name || "there"},</p>` +
          `<p style="margin:0 0 24px; font-size:14.5px; line-height:1.6; color:#555;">${BODY_COPY[status](job?.title || "the role", job?.company || "the company")}</p>` +
          emailButton(`${SITE_URL}/candidate`, "View your applications →") +
          `<p style="margin:24px 0 0; font-size:12px; color:#999; text-align:center;">This is an automated notification from Pritam Mentor.</p>`,
      ),
      text: `Hi ${candidate.full_name || "there"},\n\n${BODY_COPY[status](job?.title || "the role", job?.company || "the company").replace(/<\/?b>/g, "")}\n\nView your applications: ${SITE_URL}/candidate\n\n— Pritam Mentor`,
    }),
  });

  const sent = res.ok;
  return new Response(JSON.stringify({ sent, status: res.status }), { headers: { "Content-Type": "application/json" } });
});
