import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";
import { renderMarkdown } from "@/lib/markdown";

export const revalidate = 3600;

type Source = { title: string; url: string; snippet: string };

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("blog_posts")
    .select("title, summary, content, sources, created_at")
    .eq("slug", slug)
    .eq("status", "approved")
    .single();

  if (!post) notFound();

  const sources = (post.sources as Source[]) || [];

  return (
    <div className="wrap" style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/blog" className="muted" style={{ fontSize: 13 }}>
          ← all posts
        </Link>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
        {formatDate(post.created_at)}
      </div>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{post.title}</h1>
      <p className="muted" style={{ fontSize: 15, marginBottom: 28 }}>{post.summary}</p>
      <div>{renderMarkdown(post.content)}</div>
      {sources.length > 0 && (
        <div style={{ marginTop: 36, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            SOURCES
          </div>
          <ul style={{ paddingLeft: 18, fontSize: 13 }}>
            {sources.map((s, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
