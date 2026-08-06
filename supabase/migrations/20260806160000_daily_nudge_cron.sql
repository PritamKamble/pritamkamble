-- Daily reminder: emails every candidate who hasn't submitted a daily log
-- yet today, via the "daily-nudge" Edge Function (see
-- supabase/functions/daily-nudge/index.ts).
--
-- PREREQUISITE (run once, out-of-band - never commit the literal secret):
--   select vault.create_secret('<random-secret>', 'cron_secret',
--     'Shared secret for authenticating pg_net calls to Edge Functions');
-- Also requires RESEND_API_KEY and CRON_SECRET set as Edge Function secrets
-- in the Supabase dashboard, matching the value stored in vault above.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'daily-nudge-reminder',
  '30 13 * * *', -- 7:00 PM IST
  $$
  select net.http_post(
    url := 'https://qhcstjlyooxjekzggaqp.supabase.co/functions/v1/daily-nudge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
