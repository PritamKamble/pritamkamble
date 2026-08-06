-- (a) new table for interview scheduling/evaluation
create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.profiles(id) on delete cascade,
  interviewer_id uuid not null references public.profiles(id) on delete restrict,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  score numeric,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.interviews enable row level security;

-- admin: full access (schedule, view, update after the interview)
create policy "interviews: admin full access" on public.interviews
  for all using (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

-- candidate: read-only visibility into their own interviews
create policy "interviews: candidate reads own" on public.interviews
  for select using (candidate_id = auth.uid());

-- (b) admin needs to see the real candidate pool to pick who to schedule
drop policy "profiles: self or hr-view-candidates" on public.profiles;
create policy "profiles: self, hr, or admin view candidates" on public.profiles
  for select using (
    id = auth.uid()
    or (public.get_my_role() in ('hr', 'admin') and role = 'candidate')
  );

drop policy "candidate_profiles: self or hr view" on public.candidate_profiles;
create policy "candidate_profiles: self, hr, or admin view" on public.candidate_profiles
  for select using (
    user_id = auth.uid() or public.get_my_role() in ('hr', 'admin')
  );
