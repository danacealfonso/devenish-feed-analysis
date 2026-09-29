-- Demo accounts, one per role, for reviewers (see README → Demo accounts).
--   danacebboy@gmail.com  Devenish admin
--   kanamits2@gmail.com   nutritionist on every demo customer
--   kanamits3@gmail.com   farm team (producer) on Customer A only

-- Admin: also pre-authorised by email, in case the account is ever recreated.
insert into public.admin_emails (email) values ('danacebboy@gmail.com') on conflict do nothing;
insert into public.platform_admins (user_id)
select id from auth.users where lower(email) = 'danacebboy@gmail.com'
on conflict do nothing;

-- Nutritionist on all demo customers.
insert into public.memberships (user_id, org_id, role)
select u.id, o.id, 'nutritionist'
from auth.users u cross join public.organizations o
where lower(u.email) = 'kanamits2@gmail.com' and o.is_demo
on conflict (user_id, org_id) do update set role = 'nutritionist';

-- Farm team: only Customer A, so the producer experience (single customer, read-only settings) is visible.
delete from public.memberships
where user_id in (select id from auth.users where lower(email) = 'kanamits3@gmail.com')
  and org_id <> '00000000-0000-4000-a000-000000000001';
insert into public.memberships (user_id, org_id, role)
select id, '00000000-0000-4000-a000-000000000001', 'producer'
from auth.users where lower(email) = 'kanamits3@gmail.com'
on conflict (user_id, org_id) do update set role = 'producer';
