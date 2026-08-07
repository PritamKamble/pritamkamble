create table public.employer_leads (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  company_name text,
  openings jsonb not null default '[]',
  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'closed')),
  created_at timestamptz not null default now()
);

alter table public.employer_leads enable row level security;

-- Deliberately not scoped `to anon` - a visitor filling this out on a
-- device where they're also logged in as HR/candidate/admin in another
-- tab should still be able to submit. Caught this the hard way on the
-- first live test: an `anon`-only policy rejects any authenticated
-- session even though the row itself is harmless to insert.
create policy "employer_leads: anyone can submit"
  on public.employer_leads for insert
  with check (true);

create policy "employer_leads: admin can read"
  on public.employer_leads for select
  using (get_my_role() = 'admin');

create policy "employer_leads: admin can update"
  on public.employer_leads for update
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');
