-- Emails a candidate whenever HR changes their application status, via the
-- "application-status-notify" Edge Function (see
-- supabase/functions/application-status-notify/index.ts).
--
-- Prerequisite: same vault "cron_secret" + Edge Function secrets as
-- 20260806160000_daily_nudge_cron.sql - see that file's header comment.
create or replace function public.notify_application_status_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
begin
  if new.status is distinct from old.status then
    perform net.http_post(
      url := 'https://qhcstjlyooxjekzggaqp.supabase.co/functions/v1/application-status-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := jsonb_build_object('application_id', new.id)
    );
  end if;
  return new;
end;
$$;

create trigger on_application_status_change
  after update on public.job_applications
  for each row
  execute function public.notify_application_status_change();
