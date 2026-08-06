create table public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null default (now() at time zone 'utc')::date,
  content text not null,
  created_at timestamptz not null default now(),
  unique (candidate_id, log_date)
);

alter table public.daily_logs enable row level security;

create policy "daily_logs: candidate reads own" on public.daily_logs
  for select using (candidate_id = auth.uid());

create policy "daily_logs: candidate inserts today only" on public.daily_logs
  for insert with check (
    candidate_id = auth.uid()
    and log_date = (now() at time zone 'utc')::date
  );

create policy "daily_logs: candidate updates today only" on public.daily_logs
  for update using (candidate_id = auth.uid() and log_date = (now() at time zone 'utc')::date)
  with check (candidate_id = auth.uid() and log_date = (now() at time zone 'utc')::date);

create policy "daily_logs: admin reads all" on public.daily_logs
  for select using (public.get_my_role() = 'admin');
