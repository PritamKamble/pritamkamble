create table public.candidate_suggestions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.profiles(id),
  focus_areas jsonb not null default '[]',
  reminder text not null,
  market_note text not null,
  sources jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table public.candidate_suggestions enable row level security;

create policy "candidate_suggestions: candidate reads own"
  on public.candidate_suggestions for select
  using (candidate_id = auth.uid());

create policy "candidate_suggestions: admin reads all"
  on public.candidate_suggestions for select
  using (get_my_role() = 'admin');

-- No insert/update policy for client roles - the edge function that
-- generates these uses the service-role key, matching the pattern for
-- every other AI-generated content table in this schema (blog_posts).
