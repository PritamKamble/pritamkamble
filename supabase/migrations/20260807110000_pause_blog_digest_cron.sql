-- Feature parked: no ANTHROPIC_API_KEY secret set yet, so the daily run
-- was just producing a 500 every morning. Unscheduling rather than
-- deleting anything - the blog_posts table, RLS, admin review UI, and
-- public pages all stay in place. Re-schedule with the same cron.schedule
-- call in 20260807100000_blog_digest_cron.sql once the key is added.
select cron.unschedule('blog-daily-digest');
