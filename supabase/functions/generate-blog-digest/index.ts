import { createClient } from "jsr:@supabase/supabase-js@2";
import { Annotation, END, START, StateGraph } from "npm:@langchain/langgraph";
import { ChatAnthropic } from "npm:@langchain/anthropic";
import { HumanMessage, SystemMessage } from "npm:@langchain/core/messages";

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SERPER_API_KEY = Deno.env.get("SERPER_API_KEY");

type Source = { title: string; url: string; snippet: string };
type BlogType = "hiring_digest" | "interview_questions" | "ai_roadmap" | "tech_update";
type DraftPost = { title: string; slug: string; summary: string; content: string };

const ROTATION: BlogType[] = ["hiring_digest", "interview_questions", "ai_roadmap", "tech_update"];

function todaysBlogType(): BlogType {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000,
  );
  return ROTATION[dayOfYear % ROTATION.length];
}

async function serperSearch(query: string, num = 6): Promise<Source[]> {
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

const PUNE_GUARDRAIL = `Write for freshers and engineering students, with Pune woven in naturally throughout (Pune's college/hiring scene, Pune-based companies, local meetups or job market context) - but ONLY state a Pune-specific fact if it actually appears in the sources below. If the sources don't mention Pune, keep the framing general ("freshers across India, including Pune") rather than inventing local statistics or company names.`;

type TypeMeta = {
  freeSources?: () => Promise<Source[]>;
  seedQuery?: string;
  promptInstructions: string;
};

const TYPE_META: Record<BlogType, TypeMeta> = {
  hiring_digest: {
    freeSources: async () => {
      const [hn, jobs] = await Promise.all([fetchHackerNewsSources(), fetchRemoteOkSources()]);
      return [...hn, ...jobs];
    },
    promptInstructions: `Write a weekly hiring-trends digest: who's hiring, what skills are spiking, what freshers should notice this week.`,
  },
  interview_questions: {
    seedQuery: "fresher software engineer interview questions India 2026 real experience",
    promptInstructions: `Write an "interview question of the week" roundup: pick 3-5 real, currently-circulating interview questions for fresher/entry-level software or GenAI roles from the sources, and write a model answer for each in a mentor's voice - practical, not textbook.`,
  },
  ai_roadmap: {
    seedQuery: "AI engineer roadmap 2026 skills to learn GenAI beginners",
    promptInstructions: `Write a practical "what to learn next" AI/GenAI roadmap post for a fresher, grounded in the current sources - what's actually in demand right now, not a generic syllabus.`,
  },
  tech_update: {
    seedQuery: "latest technology updates developers should know this week",
    promptInstructions: `Write a "what changed this week in tech" update for freshers - new tool/framework releases and why a fresher building their portfolio should care.`,
  },
};

const MAX_SEARCH_ATTEMPTS = 2;

const AgentState = Annotation.Root({
  blogType: Annotation<BlogType>,
  query: Annotation<string>,
  sources: Annotation<Source[]>({
    reducer: (existing, incoming) => [...existing, ...incoming],
    default: () => [],
  }),
  attempts: Annotation<number>({ reducer: (_prev, next) => next, default: () => 0 }),
  sufficient: Annotation<boolean>({ reducer: (_prev, next) => next, default: () => false }),
  post: Annotation<DraftPost | null>({ reducer: (_prev, next) => next, default: () => null }),
});
type State = typeof AgentState.State;

function model(maxTokens: number) {
  return new ChatAnthropic({
    apiKey: ANTHROPIC_API_KEY,
    model: "claude-sonnet-4-5-20250929",
    maxTokens,
  });
}

async function searchNode(state: State) {
  const meta = TYPE_META[state.blogType];
  const results = meta.freeSources ? await meta.freeSources() : await serperSearch(state.query);
  return { sources: results, attempts: state.attempts + 1 };
}

async function evaluateNode(state: State) {
  const meta = TYPE_META[state.blogType];
  if (meta.freeSources) return { sufficient: true };
  if (state.attempts >= MAX_SEARCH_ATTEMPTS) return { sufficient: true };

  const sourcesBlock = state.sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.snippet}`).join("\n\n");
  const res = await model(300).invoke([
    new SystemMessage(
      "You judge whether web search results are specific and current enough to write a genuinely useful, non-generic blog post from - not generic evergreen advice. Respond with ONLY JSON, no commentary: " +
        '{"sufficient": boolean, "refinedQuery": string | null}',
    ),
    new HumanMessage(
      `Blog type: ${state.blogType}\nSearch query used: ${state.query}\n\nResults:\n${sourcesBlock || "(no results)"}\n\nAre these good enough? If not, give a narrower/better search query.`,
    ),
  ]);

  try {
    const judged = JSON.parse(String(res.content));
    return {
      sufficient: !!judged.sufficient,
      query: judged.refinedQuery || state.query,
    };
  } catch {
    return { sufficient: true };
  }
}

function routeAfterEvaluate(state: State): "search" | "write" {
  return state.sufficient ? "write" : "search";
}

async function writeNode(state: State) {
  const meta = TYPE_META[state.blogType];
  if (state.sources.length === 0) return { post: null };

  const sourcesBlock = state.sources
    .map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\n${s.snippet}`)
    .join("\n\n");

  const prompt = `You write for the "Pritam Mentor" blog, a 1-on-1 mentorship program that turns freshers into job-ready Full-Stack + GenAI engineers.

Tone: direct, practical, no hype, matches a working engineer talking to someone they're mentoring - not corporate blog voice.

${PUNE_GUARDRAIL}

${meta.promptInstructions}

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

  const res = await model(2048).invoke([new HumanMessage(prompt)]);
  try {
    return { post: JSON.parse(String(res.content)) as DraftPost };
  } catch {
    throw new Error(`Failed to parse model output: ${String(res.content).slice(0, 500)}`);
  }
}

const agent = new StateGraph(AgentState)
  .addNode("search", searchNode)
  .addNode("evaluate", evaluateNode)
  .addNode("write", writeNode)
  .addEdge(START, "search")
  .addEdge("search", "evaluate")
  .addConditionalEdges("evaluate", routeAfterEvaluate, { search: "search", write: "write" })
  .addEdge("write", END)
  .compile();

Deno.serve(async (req: Request) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 500 });
  }

  const blogType = todaysBlogType();
  const meta = TYPE_META[blogType];

  if (!meta.freeSources && !SERPER_API_KEY) {
    return new Response(
      JSON.stringify({ error: "SERPER_API_KEY not configured", blogType, note: "required for this post type" }),
      { status: 500 },
    );
  }

  let result: State;
  try {
    result = (await agent.invoke({
      blogType,
      query: meta.seedQuery ?? "",
      sources: [],
      attempts: 0,
      sufficient: false,
      post: null,
    })) as State;
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Agent run failed", detail: e instanceof Error ? e.message : String(e) }),
      { status: 502 },
    );
  }

  if (result.sources.length === 0) {
    return new Response(JSON.stringify({ skipped: true, reason: "no sources found today", blogType }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!result.post) {
    return new Response(JSON.stringify({ error: "Agent produced no post", blogType }), { status: 502 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const slugBase =
    result.post.slug || result.post.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const slug = `${slugBase}-${new Date().toISOString().slice(0, 10)}`;

  const { data: inserted, error } = await supabase
    .from("blog_posts")
    .insert({
      title: result.post.title,
      slug,
      summary: result.post.summary,
      content: result.post.content,
      blog_type: blogType,
      sources: result.sources,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(
    JSON.stringify({
      created: inserted.id,
      blogType,
      sourceCount: result.sources.length,
      searchAttempts: result.attempts,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
