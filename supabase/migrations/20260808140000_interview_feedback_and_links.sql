-- Phase 1 of the mock-interview upgrades:
--   * meeting_link      - video call link (e.g. Google Meet) for the interview
--   * candidate_feedback / candidate_self_score - two-way feedback: the
--     candidate leaves their own notes + self-rating, alongside the admin's
--     score/notes.
--   * reminder_sent_at  - bookkeeping so the reminder cron doesn't double-send.
alter table public.interviews
  add column if not exists meeting_link text,
  add column if not exists candidate_feedback text,
  add column if not exists candidate_self_score numeric,
  add column if not exists reminder_sent_at timestamptz;

-- Candidates are read-only on interviews (see 20260806075051_add_interviews.sql),
-- so rather than open a broad UPDATE policy we expose a narrow security-definer
-- RPC that only lets a candidate edit the feedback fields on their OWN interview.
create or replace function public.submit_interview_feedback(
  p_interview_id uuid,
  p_feedback text,
  p_self_score numeric default null
)
returns public.interviews
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  updated public.interviews;
begin
  if p_self_score is not null and (p_self_score < 0 or p_self_score > 10) then
    raise exception 'self_score must be between 0 and 10';
  end if;

  update public.interviews
     set candidate_feedback = p_feedback,
         candidate_self_score = p_self_score
   where id = p_interview_id
     and candidate_id = auth.uid()
  returning * into updated;

  if not found then
    raise exception 'Interview not found or not yours';
  end if;

  return updated;
end;
$$;

revoke all on function public.submit_interview_feedback(uuid, text, numeric) from public;
grant execute on function public.submit_interview_feedback(uuid, text, numeric) to authenticated;
