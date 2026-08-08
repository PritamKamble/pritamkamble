-- Sends a Slack message whenever someone joins the waitlist (a new row is
-- inserted into public.applicants), via a Slack Incoming Webhook and pg_net.
--
-- PREREQUISITE (run once, out-of-band - never commit the literal URL):
--   select vault.create_secret(
--     'https://hooks.slack.com/services/XXX/YYY/ZZZ', -- your Slack Incoming Webhook URL
--     'slack_waitlist_webhook_url',
--     'Slack Incoming Webhook for new waitlist signups');
--
-- If the secret is absent the trigger is a no-op, so this migration is safe to
-- apply before the webhook URL is configured.
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_slack_new_applicant()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare
  webhook_url text;
  position_num bigint;
  message text;
begin
  select decrypted_secret into webhook_url
  from vault.decrypted_secrets
  where name = 'slack_waitlist_webhook_url';

  -- No webhook configured yet - do nothing rather than error.
  if webhook_url is null then
    return new;
  end if;

  select count(*) into position_num from public.applicants;

  message := format(
    ':tada: *New waitlist signup* — applicant #%s'
    || E'\n*Name:* %s'
    || E'\n*Track:* %s  |  *Level:* %s'
    || E'\n*College / Company:* %s'
    || E'\n*Phone:* %s',
    position_num,
    coalesce(new.name, '—'),
    coalesce(new.track, '—'),
    coalesce(new.level, '—'),
    coalesce(new.college_or_company, '—'),
    coalesce(new.phone, '—')
  );

  perform net.http_post(
    url := webhook_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('text', message)
  );

  return new;
end;
$$;

create trigger on_new_applicant_notify_slack
  after insert on public.applicants
  for each row
  execute function public.notify_slack_new_applicant();
