// Books a mock interview: creates a Google Calendar event with a Meet link
// (Google emails the candidate the invite), records it in `interviews`, cancels
// the previous one when rescheduling, and pings the admin on Slack.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-internal-secret, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
function istLabel(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso)) + " IST";
}
async function googleAccessToken(id: string, secret: string, refresh: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("google token: " + JSON.stringify(j));
  return j.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const getSecret = async (name: string) => {
      const { data, error } = await svc.rpc("read_vault_secret", { p_name: name });
      if (error || !data) throw new Error(`missing secret ${name}`);
      return data as string;
    };

    const body = await req.json().catch(() => ({}));
    const startISO: string | undefined = body.start;
    if (!startISO) return json({ error: "start (ISO) required" }, 400);
    const durationMin = Number(body.duration_min ?? 45);
    const endISO = new Date(Date.parse(startISO) + durationMin * 60000).toISOString();

    // --- Auth: internal secret (service) or a user JWT (admin/candidate).
    let candidateId: string | null = body.candidate_id ?? null;
    let actorIsAdmin = false;
    const internal = req.headers.get("x-internal-secret");
    if (internal && internal === (await getSecret("scheduler_internal_secret"))) {
      actorIsAdmin = true;
    } else {
      const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
      const { data: { user } } = await createClient(url, anonKey).auth.getUser(token);
      if (!user) return json({ error: "Unauthorized" }, 401);
      const { data: prof } = await svc
        .from("profiles").select("role").eq("id", user.id).single();
      if (prof?.role === "admin") {
        actorIsAdmin = true;
      } else {
        candidateId = user.id; // candidates can only book/reschedule their own
      }
    }
    if (!candidateId) return json({ error: "candidate_id required" }, 400);

    // Interviewer is the (single) admin/mentor.
    const { data: adminProf } = await svc
      .from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();
    if (!adminProf) return json({ error: "No admin/interviewer found" }, 500);

    const { data: cand } = await svc
      .from("profiles").select("full_name, email").eq("id", candidateId).single();
    if (!cand) return json({ error: "Candidate not found" }, 404);

    // --- Create the Google Calendar event with a Meet link.
    const at = await googleAccessToken(
      await getSecret("google_oauth_client_id"),
      await getSecret("google_oauth_client_secret"),
      await getSecret("google_oauth_refresh_token"),
    );
    const evRes = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: `Mock interview — ${cand.full_name ?? "Candidate"}`,
          description: body.notes || "Mock interview via Pritam Mentor.",
          start: { dateTime: startISO, timeZone: "Asia/Kolkata" },
          end: { dateTime: endISO, timeZone: "Asia/Kolkata" },
          attendees: cand.email ? [{ email: cand.email }] : [],
          conferenceData: {
            createRequest: {
              requestId: `mock-${crypto.randomUUID()}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }),
      },
    );
    const ev = await evRes.json();
    if (ev.error) return json({ error: "google event: " + JSON.stringify(ev.error) }, 500);
    const meetLink: string | null = ev.hangoutLink ?? null;

    // --- Record the interview; cancel the old one if this is a reschedule.
    if (body.rescheduled_from) {
      await svc.from("interviews")
        .update({ status: "cancelled" })
        .eq("id", body.rescheduled_from);
    }
    const { data: inserted, error: insErr } = await svc
      .from("interviews")
      .insert({
        candidate_id: candidateId,
        interviewer_id: adminProf.id,
        scheduled_at: startISO,
        meeting_link: meetLink,
        google_event_id: ev.id,
        notes: body.notes || null,
        rescheduled_from: body.rescheduled_from ?? null,
      })
      .select("id")
      .single();
    if (insErr) return json({ error: insErr.message }, 500);

    // --- Slack alert to the admin (best-effort).
    try {
      const hook = await getSecret("slack_waitlist_webhook_url");
      await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text:
            `:calendar: *Mock interview ${body.rescheduled_from ? "rescheduled" : "scheduled"}*` +
            `\n*Candidate:* ${cand.full_name ?? cand.email}` +
            `\n*When:* ${istLabel(startISO)}` +
            (meetLink ? `\n*Meet:* ${meetLink}` : "") +
            (actorIsAdmin ? "" : "\n_(booked by the candidate)_"),
        }),
      });
    } catch { /* non-fatal */ }

    return json({
      interview_id: inserted.id,
      meeting_link: meetLink,
      google_event_id: ev.id,
      scheduled_at: startISO,
      label: istLabel(startISO),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
