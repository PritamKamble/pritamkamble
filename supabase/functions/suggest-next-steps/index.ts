import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SERPER_API_KEY = Deno.env.get("SERPER_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Source = { title: string; url: string; snippet: string };

async function serperSearch(query: string, num = 5): Promise<Source[]> {
  if (!SERPER_API_KEY) return [];
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.organic || []).map((r: { title: string; link: string; snippet?: string }) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet || "",
    }));
  } catch {
    return [];
  }
}

const TRACK_LABELS: Record<string, string> = {
  fullstack: "Full-Stack",
  genai: "GenAI",
  fullstack_genai: "Full-Stack + GenAI",
  cloud: "Cloud/DevOps",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
  const jwt = authHeader.replace("Bearer ", "");

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data: callerData, error: callerError } = await anonClient.auth.getUser(jwt);
  if (callerError || !callerData?.user) return json({ error: "Invalid session" }, 401);
  const candidateId = callerData.user.id;

  if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: callerProfile } = await admin.from("profiles").select("role").eq("id", candidateId).single();
  if (callerProfile?.role !== "candidate") return json({ error: "Forbidden - candidates only" }, 403);

  const [{ data: cp }, { data: logs }, { data: interviews }, { data: jobs }] = await Promise.all([
    admin
      .from("candidate_profiles")
      .select("track, level, weeks_completed, dsa_solved, capstone_status")
      .eq("user_id", candidateId)
      .maybeSingle(),
    admin
      .from("daily_logs")
      .select("log_date, content")
      .eq("candidate_id", candidateId)
      .order("log_date", { ascending: false })
      .limit(14),
    admin
      .from("interviews")
      .select("scheduled_at, score, notes")
      .eq("candidate_id", candidateId)
      .eq("status", "completed")
      .order("scheduled_at", { ascending: false })
      .limit(5),
    admin.from("jobs").select("title, company, track_tags, description").eq("status", "open").limit(15),
  ]);

  const track = cp?.track || "fullstack_genai";
  const trackLabel = TRACK_LABELS[track] || track;

  const relevantJobs = (jobs || []).filter(
    (j) => !j.track_tags || j.track_tags.length === 0 || j.track_tags.includes(track),
  );

  const marketSources = await serperSearch(
    `${trackLabel} fresher developer skills in demand India 2026 hiring`,
  );

  if ((logs || []).length === 0 && (interviews || []).length === 0) {
    return json({
      skipped: true,
      reason: "No daily logs or interview feedback yet - log some progress first so there's something to analyze.",
    });
  }

  const logsBlock = (logs || [])
    .map((l) => `${l.log_date}: ${l.content}`)
    .join("\n");
  const interviewsBlock = (interviews || [])
    .map((iv) => `${iv.scheduled_at} - score ${iv.score ?? "—"}/10 - notes: ${iv.notes || "(no notes)"}`)
    .join("\n");
  const jobsBlock = relevantJobs
    .map((j) => `${j.title} at ${j.company}: ${(j.description || "").slice(0, 200)}`)
    .join("\n");
  const marketBlock = marketSources
    .map((s, i) => `[${i + 1}] ${s.title}\n${s.snippet}`)
    .join("\n\n");

  const prompt = `You are a mentor giving one specific, honest candidate their next-steps prep plan. Track: ${trackLabel}, level: ${cp?.level || "beginner"}, weeks completed: ${cp?.weeks_completed ?? 0}, DSA solved: ${cp?.dsa_solved ?? 0}, capstone status: ${cp?.capstone_status || "not_started"}.

THEIR RECENT DAILY LOGS (what they actually worked on):
${logsBlock || "(none yet)"}

THEIR MOCK INTERVIEW FEEDBACK:
${interviewsBlock || "(none yet)"}

OPEN ROLES ON THIS PLATFORM THEY COULD APPLY TO:
${jobsBlock || "(none currently open for this track)"}

CURRENT MARKET SIGNAL (what's in demand right now):
${marketBlock || "(no current search results)"}

Based ONLY on the above - don't invent facts, job postings, or market claims not present here - write:
1. 3-5 specific, actionable focus areas for what they should prepare next (not generic advice - grounded in gaps visible in their actual logs/interview notes, and where relevant, skills the open roles or market signal call for).
2. A short, direct reminder message (1-2 sentences, encouraging but honest, mentor voice not corporate).
3. A one-sentence market note connecting their prep to what's actually in demand right now.

Respond with ONLY a JSON object (no markdown fences, no commentary):
{
  "focus_areas": ["...", "...", "..."],
  "reminder": "...",
  "market_note": "..."
}`;

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    return json({ error: `Anthropic API error: ${aiRes.status}`, detail: errText }, 502);
  }

  const aiData = await aiRes.json();
  const rawText = aiData?.content?.[0]?.text || "";

  let parsed: { focus_areas: string[]; reminder: string; market_note: string };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return json({ error: "Failed to parse model output", raw: rawText }, 502);
  }

  const { data: inserted, error: insertError } = await admin
    .from("candidate_suggestions")
    .insert({
      candidate_id: candidateId,
      focus_areas: parsed.focus_areas,
      reminder: parsed.reminder,
      market_note: parsed.market_note,
      sources: marketSources,
    })
    .select("*")
    .single();

  if (insertError) return json({ error: insertError.message }, 500);

  return json({ suggestion: inserted });
});
