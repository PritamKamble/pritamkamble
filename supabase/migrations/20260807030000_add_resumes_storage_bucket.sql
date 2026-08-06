insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  true,
  5242880, -- 5MB
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

-- Candidates can only manage files under a folder named after their own user id
-- (e.g. "{user_id}/resume.pdf"), enforced by checking the first path segment.
create policy "resumes: candidate manages own folder - insert"
  on storage.objects for insert
  with check (
    bucket_id = 'resumes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "resumes: candidate manages own folder - update"
  on storage.objects for update
  using (
    bucket_id = 'resumes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "resumes: candidate manages own folder - delete"
  on storage.objects for delete
  using (
    bucket_id = 'resumes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Public bucket: anyone with the direct URL can view (matches the existing
-- resume_url column, which was already just a plain shareable link).
create policy "resumes: public read"
  on storage.objects for select
  using (bucket_id = 'resumes');
