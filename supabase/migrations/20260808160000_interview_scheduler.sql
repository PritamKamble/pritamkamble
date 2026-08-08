-- AI-assisted interview scheduling: capture candidate availability and link
-- interviews to their Google Calendar event.

-- Candidate availability. `windows` is a normalized weekly availability in IST,
-- e.g. [{"day":1,"start":"18:00","end":"21:00"}] where day is 0=Sun .. 6=Sat.
-- `raw_text` keeps whatever the candidate typed (the scheduler uses Gemini to
-- turn free text into `windows`).
create table if not exists public.candidate_availability (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  raw_text text,
  windows jsonb not null default '[]'::jsonb,
  timezone text not null default 'Asia/Kolkata',
  updated_at timestamptz not null default now()
);

alter table public.candidate_availability enable row level security;

-- Candidate fully manages their own availability.
create policy "availability: candidate manages own"
  on public.candidate_availability
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Admin can read everyone's availability (to schedule).
create policy "availability: admin reads all"
  on public.candidate_availability
  for select
  using (public.get_my_role() = 'admin');

-- Link an interview to its Google Calendar event (so we can update/cancel it)
-- and track reschedules.
alter table public.interviews
  add column if not exists google_event_id text,
  add column if not exists rescheduled_from uuid references public.interviews(id);
