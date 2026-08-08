<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Pritam Mentor is a Next.js 16 App Router app (`npm run dev`) against a **hosted** Supabase project (`qhcstjlyooxjekzggaqp` / `pritam-next`). There is no local Supabase/Docker stack and no automated test suite — verify with lint, typecheck, and manual portal flows.

### Run / lint
- Dependencies: `npm install` (Node 22). Env: copy `.env.example` → `.env.local` (public anon key is also embedded in `public/index.html`).
- Dev server: `npm run dev` (port 3000). Lint: `npm run lint`. Typecheck: `npx tsc --noEmit`.
- Prefer editing `app/` over the legacy static `public/` site; Vercel hosts the Next app.

### AI interview scheduler (live)
- Edge functions: `schedule-suggest`, `schedule-confirm`, `interview-reminders` (cron every 15m). Secrets live in Supabase Vault (`gemini_api_key`, Google OAuth trio, `scheduler_internal_secret`, Slack webhooks).
- Interview Slack alerts prefer Vault `slack_interview_webhook_url`, then fall back to `slack_waitlist_webhook_url`.
- UI: candidate **Interviews** tab (availability + suggest/book/reschedule + two-way feedback); admin Candidates schedule expander (**✦ AI suggest times**). Times are IST via `lib/formatDate.ts` (`Asia/Kolkata`).
- Do not reintroduce `temp-debug-genlink` (account-takeover risk); it was neutralized in prod and must stay out of the public repo.
