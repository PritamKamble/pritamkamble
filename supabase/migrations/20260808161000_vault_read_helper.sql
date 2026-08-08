-- Lets edge functions (using the service_role key) read a named secret from
-- Vault. security definer so it can see vault.decrypted_secrets; execute is
-- restricted to service_role only, so anon/authenticated users can never call
-- it to exfiltrate secrets.
create or replace function public.read_vault_secret(p_name text)
returns text
language sql
security definer
set search_path to 'public', 'vault'
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name;
$$;

revoke all on function public.read_vault_secret(text) from public, anon, authenticated;
grant execute on function public.read_vault_secret(text) to service_role;
