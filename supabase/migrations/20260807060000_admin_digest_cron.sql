-- Daily admin digest: candidates who missed logging yesterday, applicants
-- waiting 5+ days with no status change, interviews in the next 24h. Sent
-- via the "admin-digest" Edge Function (see
-- supabase/functions/admin-digest/index.ts).
--
-- Prerequisite: same vault "cron_secret" + Edge Function secrets as
-- 20260806160000_daily_nudge_cron.sql - see that file's header comment.
select cron.schedule(
  'admin-daily-digest',
  '30 2 * * *', -- 8:00 AM IST
  $$
  select net.http_post(
    url := 'https://qhcstjlyooxjekzggaqp.supabase.co/functions/v1/admin-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
