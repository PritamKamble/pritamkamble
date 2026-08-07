create policy "admin can update applicants"
  on public.applicants
  for update
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');
