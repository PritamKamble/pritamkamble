# Email templates

These three files are the source of truth for the auth emails (Magic Link,
Recovery, Invite user) — matching what's live in Supabase Dashboard →
Authentication → Emails as of 2026-08-07.

## Why this isn't fully automatic

Supabase's email templates are dashboard-only for a Cloud project unless you
push them with the **Supabase CLI** (`supabase link` + `supabase config
push`), which isn't available as a tool in this environment — nothing here
can call it. So for now:

- **This repo is the real, reviewable source of truth** for what the
  templates *should* say — no more losing track of what's live vs. what's
  been tried, which is what caused most of the confusion while first getting
  these working.
- **The dashboard still needs a manual copy-paste** whenever a template
  file here changes. Copy the file's content into the matching template's
  "Message body" field, and the subject from `config.toml` into the
  "Subject heading" field.

## If you want this fully automated later

Install the Supabase CLI, run `supabase link --project-ref
qhcstjlyooxjekzggaqp`, then `supabase config push`. Two things to know
before doing that:

1. `config.toml` in this repo currently only defines the email templates.
   `config push` syncs the *entire* auth config it finds in that file - if
   other settings (Site URL, redirect URLs, session lifetime, etc.) aren't
   also captured there first, pushing could silently reset them to
   defaults. Pull the live config first (`supabase config pull` or a
   manual dashboard review) and merge it into `config.toml` before ever
   pushing.
2. Do this yourself, deliberately - not something to run casually, given
   what a wrong push could touch.

## Template reference

| File | Used for | `type` in the verify link |
|---|---|---|
| `magic_link.html` | Regular login (candidate + HR) | `magiclink` |
| `recovery.html` | Also used for some existing-user logins (Supabase's own routing, confirmed via auth logs during setup) | `recovery` |
| `invite.html` | Admin-invited candidate accounts | `invite` |

All three share the same verify-link pattern:
```
https://qhcstjlyooxjekzggaqp.supabase.co/auth/v1/verify?token={{ .TokenHash }}&type=<literal-type-above>&redirect_to={{ .RedirectTo }}
```

`{{ .Type }}` is **not** a real Supabase template variable - it must be the
literal type string per template, hardcoded. Using `{{ .Type }}` was an
earlier mistake here that produced `type=` (empty) in the link and broke
verification; worth remembering if a template ever needs rebuilding from
scratch.
