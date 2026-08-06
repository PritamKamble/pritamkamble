-- Formalize 'admin' as a real profiles.role, close the self-signup-as-admin
-- hole this opens, migrate applicants admin RLS off a hardcoded email, and
-- retire the orphaned passcode-protected admin RPCs (hardcoded plaintext
-- passcode in function source, callable by anyone with the anon key).

-- (a) allow 'admin' as a role
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['candidate', 'hr', 'admin']));

-- (b) handle_new_user() must not blindly trust client-supplied role now that
-- 'admin' is a valid value - explicitly whitelist 'hr', everything else
-- (including a spoofed 'admin') collapses to 'candidate'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, role, full_name, email, company_name)
  values (
    new.id,
    case when new.raw_user_meta_data->>'role' = 'hr' then 'hr' else 'candidate' end,
    coalesce(new.raw_user_meta_data->>'full_name', 'New user'),
    new.email,
    new.raw_user_meta_data->>'company_name'
  );
  return new;
end;
$function$;

-- (c) one-time manual promotion of the site owner to admin. No self-serve
-- admin signup/invite flow in this phase - single known admin.
update public.profiles set role = 'admin' where email = '7276279026.pk@gmail.com';

-- (d) replace hardcoded-email RLS policy with role-based, consistent with
-- the rest of the schema.
drop policy "admin can read applicants" on public.applicants;
create policy "admin can read applicants" on public.applicants
  for select using (public.get_my_role() = 'admin');

-- (e) retire the passcode RPCs entirely. current admin.html no longer calls
-- them (confirmed orphaned); the plaintext passcode lives in the function
-- source regardless of grants, so revoke-only would leave it exposed for
-- no benefit.
drop function if exists public.admin_list_applicants(text);
drop function if exists public.admin_update_status(text, uuid, text);
drop function if exists public.admin_set_verified(text, uuid, boolean);
