-- Same bug as employer_leads (see 20260807130000): the waitlist INSERT
-- policy was scoped to the `anon` role only. A visitor who happens to
-- still have an active session (logged in as candidate/HR/admin in
-- another tab on the same device) would get rejected by RLS instead of
-- the waitlist application going through. The public waitlist form
-- should accept a submission regardless of the visitor's auth state.
drop policy "anon can apply" on public.applicants;

create policy "anyone can apply"
  on public.applicants for insert
  with check (true);
