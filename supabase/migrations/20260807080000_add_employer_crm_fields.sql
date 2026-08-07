alter table public.profiles
  add column admin_notes text,
  add column last_contacted_at timestamptz,
  add column follow_up_due date;

create policy "profiles: admin view all"
  on public.profiles for select
  using (get_my_role() = 'admin');

create policy "profiles: admin update hr"
  on public.profiles for update
  using (get_my_role() = 'admin' and role = 'hr')
  with check (get_my_role() = 'admin' and role = 'hr');
