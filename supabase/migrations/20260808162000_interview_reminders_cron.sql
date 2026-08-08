-- Runs the interview-reminders Edge Function every 15 minutes: sends ~1h-before
-- reminders and flags missed interviews as no_show (see
-- supabase/functions/interview-reminders/index.ts).
--
-- Auth uses the 'scheduler_internal_secret' Vault secret (created out-of-band).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'interview-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://qhcstjlyooxjekzggaqp.supabase.co/functions/v1/interview-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'scheduler_internal_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
