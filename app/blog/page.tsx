import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/formatDate";

export const revalidate = 3600;

export default async function BlogIndexPage() {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("blog_posts")
    .select("id, title, slug, summary, created_at")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  return (
    <div className="wrap">
      <div style={{ marginBottom: 24 }}>
        <Link href="/index.html" className="muted" style={{ fontSize: 13 }}>
          ← back to site
        </Link>
      </div>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Blog</h1>
      <p className="muted" style={{ marginBottom: 28 }}>
        Hiring trends and what&apos;s changing in the Full-Stack + GenAI world, for people prepping for their first job.
      </p>
      {!posts || posts.length === 0 ? (
        <div className="empty">No posts yet — check back soon.</div>
      ) : (
        posts.map((post) => (
          <Link
            key={post.id}
            href={`/blog/${post.slug}`}
            className="card"
            style={{ display: "block", marginBottom: 14, textDecoration: "none", color: "inherit" }}
          >
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              {formatDate(post.created_at)}
            </div>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>{post.title}</h2>
            <p className="muted" style={{ fontSize: 14 }}>{post.summary}</p>
          </Link>
        ))
      )}
    </div>
  );
}
