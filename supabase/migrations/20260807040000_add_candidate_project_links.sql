alter table public.candidate_profiles
  add column project_links jsonb not null default '[]'::jsonb;

comment on column public.candidate_profiles.project_links is
  'Array of {label, url} objects - GitHub repos / live demos the candidate wants employers to verify their work against.';
