// Suggests interview slots for a candidate: combines the admin's Google
// Calendar free/busy, the candidate's stated availability, and existing
// bookings, then asks Gemini to pick the best few. Times are IST.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const IST_OFFSET_MIN = 330; // India has no DST: fixed UTC+5:30
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-internal-secret, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Win = { day: number; start: string; end: string };
type Interval = { start: number; end: number };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function istDateParts(ms: number) {
  const d = new Date(ms + IST_OFFSET_MIN * 60000);
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth(),
    da: d.getUTCDate(),
    wd: d.getUTCDay(),
  };
}
function utcFromIst(y: number, mo: number, da: number, hh: number, mi: number) {
  return Date.UTC(y, mo, da, hh, mi) - IST_OFFSET_MIN * 60000;
}
function istLabel(ms: number) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(ms)) + " IST";
}
function dayKey(ms: number) {
  const p = istDateParts(ms);
  return `${p.y}-${p.mo}-${p.da}`;
}
function overlaps(aStart: number, aEnd: number, b: Interval) {
  return aStart < b.end && aEnd > b.start;
}

async function googleAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("google token: " + JSON.stringify(j));
  return j.access_token as string;
}

async function gemini(apiKey: string, prompt: string): Promise<string> {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );
    const j = await r.json();
    return j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const getSecret = async (name: string): Promise<string> => {
      const { data, error } = await svc.rpc("read_vault_secret", {
        p_name: name,
      });
      if (error || !data) throw new Error(`missing secret ${name}`);
      return data as string;
    };

    const body = await req.json().catch(() => ({}));

    // --- Auth: internal secret (cron/service) or a user JWT (admin/candidate).
    let candidateId: string | null = null;
    const internal = req.headers.get("x-internal-secret");
    if (internal && internal === (await getSecret("scheduler_internal_secret"))) {
      candidateId = body.candidate_id ?? null;
    } else {
      const token = (req.headers.get("Authorization") ?? "").replace(
        "Bearer ",
        "",
      );
      const {
        data: { user },
      } = await createClient(url, anonKey).auth.getUser(token);
      if (!user) return json({ error: "Unauthorized" }, 401);
      const { data: prof } = await svc
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      candidateId =
        prof?.role === "admin" ? body.candidate_id ?? user.id : user.id;
    }
    if (!candidateId) return json({ error: "candidate_id required" }, 400);

    const durationMin = Number(body.duration_min ?? 45);
    const daysAhead = Number(body.days_ahead ?? 10);
    const maxPerDay = Number(body.max_per_day ?? 2);
    const stepMin = 30;
    const leadMs = 12 * 3600000;
    const now = Date.now();

    // --- Candidate availability (parse free text with Gemini if needed).
    const { data: avail } = await svc
      .from("candidate_availability")
      .select("raw_text, windows")
      .eq("user_id", candidateId)
      .maybeSingle();

    let windows: Win[] = (avail?.windows as Win[]) ?? [];
    const geminiKey = await getSecret("gemini_api_key");
    if (windows.length === 0 && avail?.raw_text) {
      const txt = await gemini(
        geminiKey,
        `Convert this weekly availability into JSON only, an array of {"day":0-6 (0=Sunday),"start":"HH:MM","end":"HH:MM"} in 24h IST. No prose.\nAvailability: "${avail.raw_text}"`,
      );
      const m = txt.match(/\[[\s\S]*\]/);
      if (m) {
        try {
          windows = JSON.parse(m[0]);
        } catch { /* ignore */ }
      }
    }
    if (windows.length === 0) {
      return json({
        candidate_id: candidateId,
        slots: [],
        note: "No availability on file for this candidate yet.",
      });
    }

    // --- Admin Google free/busy + existing interviews as busy intervals.
    const at = await googleAccessToken(
      await getSecret("google_oauth_client_id"),
      await getSecret("google_oauth_client_secret"),
      await getSecret("google_oauth_refresh_token"),
    );
    const fbRes = await fetch(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          timeMin: new Date(now).toISOString(),
          timeMax: new Date(now + daysAhead * 86400000).toISOString(),
          items: [{ id: "primary" }],
        }),
      },
    );
    const fbJson = await fbRes.json();
    const busy: Interval[] = (fbJson?.calendars?.primary?.busy ?? []).map(
      (b: { start: string; end: string }) => ({
        start: Date.parse(b.start),
        end: Date.parse(b.end),
      }),
    );

    const { data: existing } = await svc
      .from("interviews")
      .select("scheduled_at")
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date(now).toISOString());
    const existingIntervals: Interval[] = (existing ?? []).map((r) => {
      const s = Date.parse(r.scheduled_at as string);
      return { start: s, end: s + durationMin * 60000 };
    });
    const perDay: Record<string, number> = {};
    for (const iv of existingIntervals) {
      const k = dayKey(iv.start);
      perDay[k] = (perDay[k] ?? 0) + 1;
    }

    // --- Generate candidate slots across the window, filter conflicts + cap.
    const slots: { start: number; end: number; label: string }[] = [];
    const todayIst = istDateParts(now);
    for (let i = 0; i <= daysAhead && slots.length < 12; i++) {
      const base = Date.UTC(todayIst.y, todayIst.mo, todayIst.da + i);
      const d = new Date(base);
      const y = d.getUTCFullYear(),
        mo = d.getUTCMonth(),
        da = d.getUTCDate(),
        wd = d.getUTCDay();
      const key = `${y}-${mo}-${da}`;
      for (const w of windows.filter((x) => x.day === wd)) {
        const [sh, sm] = w.start.split(":").map(Number);
        const [eh, em] = w.end.split(":").map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        for (let t = startMin; t + durationMin <= endMin; t += stepMin) {
          if ((perDay[key] ?? 0) >= maxPerDay) break;
          const s = utcFromIst(y, mo, da, Math.floor(t / 60), t % 60);
          const e = s + durationMin * 60000;
          if (s < now + leadMs) continue;
          if (busy.some((b) => overlaps(s, e, b))) continue;
          if (existingIntervals.some((b) => overlaps(s, e, b))) continue;
          slots.push({ start: s, end: e, label: istLabel(s) });
          perDay[key] = (perDay[key] ?? 0) + 1;
          if (slots.length >= 12) break;
        }
      }
    }

    if (slots.length === 0) {
      return json({
        candidate_id: candidateId,
        slots: [],
        note: "No conflict-free slots in the candidate's availability for the next few days.",
      });
    }

    // --- Ask Gemini to pick the best 3 with a short reason (graceful fallback).
    let picked = slots.slice(0, 3).map((s) => ({
      start: new Date(s.start).toISOString(),
      end: new Date(s.end).toISOString(),
      label: s.label,
      reason: "Fits the candidate's availability and your open calendar.",
    }));
    const rankText = await gemini(
      geminiKey,
      `You are scheduling a 1:1 mock interview (IST). The candidate said: "${avail?.raw_text ?? "(structured availability)"}".\nHere are conflict-free options (index: time):\n${slots
        .map((s, i) => `${i}: ${s.label}`)
        .join("\n")}\nPick the best 3 indices and give a one-line reason each. Return JSON only: [{"index":N,"reason":"..."}].`,
    );
    const m = rankText.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const arr = JSON.parse(m[0]) as { index: number; reason: string }[];
        const chosen = arr
          .filter((x) => slots[x.index])
          .slice(0, 3)
          .map((x) => ({
            start: new Date(slots[x.index].start).toISOString(),
            end: new Date(slots[x.index].end).toISOString(),
            label: slots[x.index].label,
            reason: x.reason,
          }));
        if (chosen.length) picked = chosen;
      } catch { /* keep fallback */ }
    }

    return json({ candidate_id: candidateId, slots: picked });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
