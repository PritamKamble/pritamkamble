-- Daily blog digest generation: pulls hiring/tech-trend sources (Hacker
-- News, GitHub releases, RemoteOK) and drafts a post via Claude, saved as
-- status='pending' for admin review. See
-- supabase/functions/generate-blog-digest/index.ts.
--
-- Requires an ANTHROPIC_API_KEY Edge Function secret to actually generate
-- (not yet set - add it in Supabase Dashboard -> Edge Functions -> Secrets
-- before this cron will produce anything other than a 500).
select cron.schedule(
  'blog-daily-digest',
  '0 3 * * *', -- 8:30 AM IST
  $$
  select net.http_post(
    url := 'https://qhcstjlyooxjekzggaqp.supabase.co/functions/v1/generate-blog-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
