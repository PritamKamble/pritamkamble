<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

This repo is a single product, **Pritam Mentor**: a Next.js 16 (App Router, Turbopack) + React 19 app backed by a **hosted (remote) Supabase** project. Package manager is **npm**. There is no test suite, no Docker, and no local Supabase stack (`supabase/` migrations are incremental and assume the base schema already exists on the remote project — do not expect `supabase start` to work).

- Env: the app needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` (gitignored, so it must be recreated per VM). The `anon` key is a public key already embedded in `public/index.html` (search for `SUPABASE_ANON_KEY`); copy that value plus the URL from `.env.example` into `.env.local`. Without these, marketing pages still render but auth/portal routes throw at runtime.
- Run: `npm run dev` (port 3000). `/` rewrites to the static marketing page `public/index.html`. Auth-gated routes (`/admin`, `/candidate`, `/hr`, `/login`) are guarded by `proxy.ts` (Next 16's `middleware.ts` replacement) and redirect unauthenticated users to `/login`.
- Lint/build: `npm run lint`, `npm run build` (scripts in `package.json`).
- Auth is passwordless magic-link (Supabase Auth email); candidates are invite-only via the admin panel, HR can self-signup. Fully exercising login requires a real inbox / configured Supabase Auth email, so end-to-end auth is not testable without credentials.
- Good no-auth smoke test of the full stack: submit the waitlist form on `/` (writes to the hosted Supabase `applicants` table and returns a queue position + referral link). Note this writes to the shared hosted DB.
- `next dev` auto-generates and re-adds the `nextjs-agent-rules` block in `AGENTS.md` (and `CLAUDE.md`); keep them committed so the working tree stays clean.
