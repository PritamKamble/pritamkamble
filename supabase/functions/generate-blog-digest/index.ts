import { createClient } from "jsr:@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

type Source = { title: string; url: string; snippet: string };

async function fetchHackerNewsSources(): Promise<Source[]> {
  const keywords = [
    "hiring", "hired", "job", "layoff", "interview", "ai engineer",
    "genai", "llm", "rag", "agent", "developer salary",
  ];
  const res = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
  const ids: number[] = (await res.json()).slice(0, 80);
  const items = await Promise.all(
    ids.map((id) =>
      fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then((r) => r.json()).catch(() => null),
    ),
  );
  return items
    .filter((it) => it?.title && it?.url)
    .filter((it) => keywords.some((k) => it.title.toLowerCase().includes(k)))
    .slice(0, 5)
    .map((it) => ({ title: it.title, url: it.url, snippet: `${it.score || 0} points on Hacker News` }));
}

async function fetchGithubReleaseSources(): Promise<Source[]> {
  const repos = ["langchain-ai/langchainjs", "langchain-ai/langgraphjs", "vercel/next.js", "modelcontextprotocol/servers"];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sources: Source[] = [];
  for (const repo of repos) {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!res.ok) continue;
      const rel = await res.json();
      if (rel?.published_at && new Date(rel.published_at) >= weekAgo) {
        sources.push({
          title: `${repo} released ${rel.tag_name}`,
          url: rel.html_url,
          snippet: (rel.body || "").slice(0, 300),
        });
      }
    } catch {
      // skip repo on any fetch error
    }
  }
  return sources;
}

async function fetchRemoteOkSources(): Promise<Source[]> {
  const tags = ["genai", "ai", "react", "nextjs", "fullstack", "llm"];
  try {
    const res = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "pritam-mentor-blog-bot" },
    });
    if (!res.ok) return [];
    const jobs = await res.json();
    return jobs
      .filter((j: { tags?: string[] }) => Array.isArray(j.tags) && j.tags.some((t) => tags.includes(t.toLowerCase())))
      .slice(0, 6)
      .map((j: { position: string; company: string; url: string; tags?: string[] }) => ({
        title: `${j.position} at ${j.company}`,
        url: j.url,
        snippet: `Tags: ${(j.tags || []).join(", ")}`,
      }));
  } catch {
    return [];
  }
}

Deno.serve(async (req: Request) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 500 });
  }

  const [hn, gh, jobs] = await Promise.all([
    fetchHackerNewsSources(),
    fetchGithubReleaseSources(),
    fetchRemoteOkSources(),
  ]);
  const sources = [...hn, ...gh, ...jobs];

  if (sources.length === 0) {
    return new Response(JSON.stringify({ skipped: true, reason: "no sources found today" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const sourcesBlock = sources
    .map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\n${s.snippet}`)
    .join("\n\n");

  const prompt = `You write the weekly hiring & tech-trends digest for "Pritam Mentor", a 1-on-1 mentorship program that turns freshers into job-ready Full-Stack + GenAI engineers. The audience is engineering students and freshers preparing for their first job.

Tone: direct, practical, no hype, matches a working engineer talking to someone they're mentoring - not corporate blog voice.

Using ONLY the sources below (do not invent facts, companies, or numbers not present in them), write a blog post. Cite sources inline as markdown links using the URLs given.

SOURCES:
${sourcesBlock}

Respond with ONLY a JSON object (no markdown fences, no commentary) with these exact keys:
{
  "title": "a specific, non-clickbait title",
  "slug": "url-safe-slug-based-on-title",
  "summary": "1-2 sentence summary for a card/preview",
  "content": "the full post body in markdown, 400-700 words, with a few section headings"
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
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    return new Response(JSON.stringify({ error: `Anthropic API error: ${aiRes.status}`, detail: errText }), {
      status: 502,
    });
  }

  const aiData = await aiRes.json();
  const rawText = aiData?.content?.[0]?.text || "";

  let parsed: { title: string; slug: string; summary: string; content: string };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return new Response(JSON.stringify({ error: "Failed to parse model output", raw: rawText }), { status: 502 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const slugBase = parsed.slug || parsed.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const slug = `${slugBase}-${new Date().toISOString().slice(0, 10)}`;

  const { data: inserted, error } = await supabase
    .from("blog_posts")
    .insert({
      title: parsed.title,
      slug,
      summary: parsed.summary,
      content: parsed.content,
      blog_type: "hiring_digest",
      sources,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ created: inserted.id, sourceCount: sources.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
