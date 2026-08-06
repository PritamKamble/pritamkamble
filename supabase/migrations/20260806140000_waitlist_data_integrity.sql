-- Reject whitespace-only name/phone at the DB level (client-side validation
-- alone can be bypassed by a crafted request), and prevent the same phone
-- number from applying twice.
alter table public.applicants
  add constraint applicants_phone_unique unique (phone);

alter table public.applicants
  add constraint applicants_name_not_blank check (length(trim(name)) > 0),
  add constraint applicants_phone_not_blank check (length(trim(phone)) > 0);
