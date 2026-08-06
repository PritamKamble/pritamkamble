-- Public RPC so the waitlist success panel can show live referral progress.
-- applicants has no public SELECT policy (admin-only), so this is exposed
-- as a SECURITY DEFINER function scoped to a single referral code's count,
-- matching the existing get_waitlist_count() pattern.
create or replace function public.get_referral_count(code text)
returns integer
language sql
security definer
set search_path to 'public'
as $$
  select count(*)::int from public.applicants where referred_by = code;
$$;

grant execute on function public.get_referral_count(text) to anon, authenticated;
