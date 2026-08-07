# Project log

Living record of decisions, architecture, and open items for the Pritam Mentor platform. Git history is the source of truth for *what* changed and *when* — this doc exists for the *why*, and for what's still open, since that context doesn't survive in commit messages alone. Update this when a session makes a real decision or ships something structural, not for every small fix.

## What this product is

A 1-on-1 mentorship platform (Full-Stack + GenAI) with three sides:
- **Candidates** — invite-only, track daily work logs, apply to jobs, self-report progress
- **HR/employers** — self-serve signup, post jobs, browse candidates
- **Admin** (the mentor) — manages the waitlist funnel, invites candidates, schedules interviews, reviews daily logs

Stack: Next.js (App Router) + Supabase (Postgres, Auth, Storage, Edge Functions), deployed on Vercel. No paid tier assumptions — kept intentionally lean for early-stage volume.

## Current architecture at a glance

- **Auth**: fully passwordless. Every role logs in via magic-link email, with a 6-digit OTP code as a fallback for when the link fails to click through cleanly (common on mobile, cross-app). Candidates are invite-only — no self-serve candidate signup exists anywhere; HR keeps self-serve signup since there's no queue/scarcity story to protect there.
- **Single auth callback** (`/auth/callback`) handles session establishment for every flow (login, invite, HR signup), and handles both auth flow types Supabase can hand back (`?code=` PKCE and `#access_token=` implicit) since admin-generated links (invites) use implicit while browser-initiated ones use PKCE.
- **RLS everywhere** — all 7 tables have row-level security, verified by direct attack-testing (not just reading policy text) at least once this session.
- **IaC hygiene**: `supabase/migrations/`, `supabase/functions/`, and `supabase/templates/` in git are the reviewable source of truth. Migrations and edge functions actually deploy via the MCP tool; email templates are dashboard-only (no push tool available) so those still need a manual paste when changed — documented in `supabase/templates/README.md`.
- **Daily-nudge & status-change emails**: two Edge Functions (`daily-nudge`, `application-status-notify`) triggered by `pg_cron` and a DB trigger respectively, both authenticated via a shared secret stored in Supabase Vault (not in git, not hardcoded in any migration).

## Key decisions and why

- **Candidates invite-only, HR self-serve** (2026-08-06) — the whole landing page sells "small batch, personal mentorship, apply to a queue," but self-serve candidate signup let anyone bypass that entirely. Closed by removing the signup path and gating creation behind an admin-only "Invite a candidate" action.
- **Passwordless over password+reset** (2026-08-06/07) — password-reset redirect bugs kept recurring (wrong domain, missing allow-list entries, wrong template variables) across several rounds of debugging. Removing passwords entirely removed the whole flow class, not just patched the symptom.
- **OTP code as a fallback, not a replacement, for the magic link** (2026-08-07) — the recurring "PKCE code verifier not found" failure is structural to link-based auth (opening the email in a different browser/app context than the one that requested it). A typed code has no code_verifier dependency, so it sidesteps the failure class entirely rather than just improving the error message.
- **Self-reported progress fields explicitly labeled** (2026-08-06) — `weeks_completed`/`dsa_solved` are candidate self-entry with no verification step, but were being shown to employers without that caveat (and the marketing copy on the employer page briefly overclaimed "not self-reported" — since corrected).
- **No monetization model decided yet for the employer side** — currently "free, always." Deliberately undecided, not an oversight — flagged as open in an earlier review.
- **Candidate project links added** (2026-08-07) — the employer page promised candidates' work is verifiable via "live project links," but no such field existed anywhere; only a resume upload. Added `candidate_profiles.project_links` (jsonb array) so the marketing claim matches what the product actually does.
- **Interview feedback surfaced to candidates** (2026-08-07) — admin-entered evaluation notes on completed interviews were previously admin-only; the candidate only ever saw a bare score. Added an "Interview feedback" card on the candidate's My Progress tab showing the full notes, not just the number — the notes were the part that made the review valuable.
- **Video calling as a plain meeting-link field, not built-in calling** (2026-08-07) — offered candidate a choice between a meeting-link field, embedded Jitsi rooms, or full custom video infra; chose the meeting-link field as the lowest-effort option that still solves the actual problem (admin already uses Zoom/Meet day to day). Admin pastes a link when scheduling (`interviews.meeting_link`); candidate sees a "Join call" button on the upcoming-interview card, admin sees a "Join →" link in the Interviews tab.

## Open items (not done, worth knowing about)

**Closed 2026-08-07**: Applicants status dropdown (Waiting/Contacted/Enrolled now actually changeable, needed a new admin UPDATE RLS policy on `applicants`), HR track/level filters on Browse Candidates, and a daily 8am IST admin digest email (`admin-digest` function + cron — missed-logging candidates, applicants waiting 5+ days, interviews in next 24h, skips sending if nothing to report).

- **Lightweight employer CRM** (2026-08-07) — flagged in the BDE review as missing, built as `admin_notes`/`last_contacted_at`/`follow_up_due` columns on `profiles` (not a new table — employers are just `profiles` rows with `role='hr'`) plus a new "Employers" tab on the admin panel. This needed two new RLS policies since admin previously couldn't even SELECT hr-role profiles, only candidate ones. Overdue follow-ups now surface in the existing daily admin-digest email instead of a separate reminder system, since that pipe already existed.
- **UX review of all 6 outbound emails, two fixes shipped** (2026-08-07) — reviewed the 3 branded auth templates plus the 3 plain edge-function emails (daily-nudge, application-status-notify, admin-digest). Found the live **Invite user** template on the Supabase dashboard was a completely different, unbranded plain-text version with no OTP code fallback at all — worse than the magic-link/recovery gap found earlier the same day. Fixed by replacing it with the branded `invite.html` content directly in the dashboard. Also found the three auth templates had three different live subject lines (`config.toml` says "sign-in code" for all; dashboard had "sign-in link" and a bare "Sign in to Pritam Mentor") — normalized to match `config.toml`. Separately, `application-status-notify` was literally interpolating the raw `status` enum value (e.g. "was updated to: **rejected**") into the candidate-facing email body — replaced with real per-status copy. Remaining open from that review, not yet built: no branding/visual consistency across the 3 plain transactional emails, no preheader text, no plain-text fallback — lower priority, flagged but deferred.
- **Live email templates found drifted from the repo** (2026-08-07) — the Magic Link and Recovery templates in the Supabase dashboard were missing the entire "enter this code instead" block (only the sign-in link was there), despite `supabase/templates/README.md` claiming they matched as of this same date. Real-world effect: users saw the login page promise a 6-digit code, but the actual email had no code, so the OTP fallback (added earlier this session specifically to work around magic-link failures) was silently broken in production. Fixed by hand-editing both templates directly in the dashboard and verifying with a real inbox. Since there's still no push tool, this class of drift (repo says X, dashboard has Y) can recur silently — worth spot-checking the live templates occasionally rather than trusting the repo copy.
- **Table status `<select>`s and mobile applicants table fixed** (2026-08-07) — status dropdowns in the admin Applicants tab and HR job-applications table were bare `<select>` elements outside the `.field` wrapper the theme CSS targets, so they rendered as unstyled browser-default white dropdowns. Added a `.select-sm` class. Also added a `.responsive-table` CSS variant that stacks the 10-column applicants table into per-row cards below 640px — it was previously just clipped at the card edge on phones with no visible way to know it scrolled.
- `app/candidate/page.tsx` and `app/admin/page.tsx` are large single-file components (700-900 lines) — fine for now, will need splitting if they keep growing at this pace.
- No automated tests, no CI — every verification this session was manual (browser automation + direct DB checks). Reasonable for current team size (one person), worth revisiting if that changes.
- Email templates require a manual dashboard paste whenever `supabase/templates/*.html` changes — no push tool available to automate this from here.

## Operational notes for future sessions

- To test any auth flow without real inbox access: `supabase.auth.admin.generateLink()` via a temporary edge function returns a usable `action_link`/`email_otp` without sending real email. Always neuter or redeploy the debug function to a no-op afterward — never leave a live secret-gated admin-capability endpoint sitting around.
- The project's Supabase ref is `qhcstjlyooxjekzggaqp`. Production domain is `pritamkamble.com`, admin subdomain `admin.pritamkamble.com`.
- WhatsApp outreach templates live in `docs/whatsapp-templates.md`.
