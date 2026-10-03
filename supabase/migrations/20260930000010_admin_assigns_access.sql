-- Access comes only from an invitation or a Devenish admin. A new sign-up without an invitation no longer
-- joins the demo customers; it waits on "You don't have access to a customer yet" until an admin adds it
-- (Admin → Waiting for access, or a customer's Team page).

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do update set email = excluded.email, full_name = coalesce(excluded.full_name, public.profiles.full_name);

  perform public._claim_invitations_for(new.id);
  return new;
end;
$$;

-- Remove the demo access that sign-ups were given automatically. Kept: the demo accounts
-- (…07_demo_accounts.sql) and anyone added through an invitation (an admin or nutritionist added them).
delete from public.memberships m
using public.organizations o
where o.id = m.org_id
  and o.is_demo
  and m.user_id not in (
    select id from auth.users where lower(email) in ('danacebboy@gmail.com', 'kanamits2@gmail.com', 'kanamits3@gmail.com')
  )
  and not exists (
    select 1 from public.invitations i where i.org_id = m.org_id and i.accepted_by = m.user_id
  );
