-- Let a candidate withdraw their own application, but only while it's still
-- in "applied" status - once HR has acted on it (shortlisted/rejected/hired)
-- it becomes a record, not a draft, and can no longer be deleted.
create policy "applications: candidate withdraws own if still applied"
  on public.job_applications
  for delete
  using (candidate_id = auth.uid() and status = 'applied');
