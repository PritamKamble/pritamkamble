create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  summary text not null,
  content text not null,
  blog_type text not null default 'hiring_digest',
  sources jsonb not null default '[]',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.blog_posts enable row level security;

create policy "blog_posts: public read approved"
  on public.blog_posts for select
  using (status = 'approved');

create policy "blog_posts: admin read all"
  on public.blog_posts for select
  using (get_my_role() = 'admin');

create policy "blog_posts: admin update"
  on public.blog_posts for update
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');
