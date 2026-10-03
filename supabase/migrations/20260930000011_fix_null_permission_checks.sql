-- Security fix: permission checks must be false, never NULL, for someone who isn't a member.
--
-- org_role() is NULL for a non-member, so `org_role(p_org) = 'nutritionist'` was NULL, and so was can_manage().
-- `if not (NULL) then raise …` doesn't raise, which let anyone signed in, who knew a customer's id:
--   invite_member     add themselves (or anyone) to that customer, as a nutritionist
--   set_member_role   change anyone's role there
--   remove_member     remove anyone from it
--   revoke_invitation revoke its pending invitations
-- (RLS policies were not affected: a NULL policy result already means "no".)

create or replace function public.can_manage(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or coalesce(public.org_role(p_org) = 'nutritionist', false);
$$;

create or replace function public.invite_member(p_org uuid, p_email text, p_role text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_my_role text := coalesce(public.org_role(p_org), '');
  v_user uuid;
  v_id uuid;
begin
  if p_role not in ('producer', 'nutritionist') then
    raise exception 'Unknown role %', p_role using errcode = '22023';
  end if;
  if not (public.is_admin() or v_my_role = 'nutritionist' or (v_my_role = 'producer' and p_role = 'producer')) then
    raise exception 'You can''t invite a % to this customer', p_role using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That doesn''t look like an email address' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.memberships m join public.profiles p on p.id = m.user_id
    where m.org_id = p_org and p.email = v_email
  ) then
    raise exception '% already has access to this customer', v_email using errcode = '23505';
  end if;

  -- Someone with a confirmed account gets access straight away.
  select id into v_user from auth.users where lower(email) = v_email and email_confirmed_at is not null;
  if v_user is not null then
    insert into public.memberships (user_id, org_id, role) values (v_user, p_org, p_role);
    insert into public.invitations (org_id, email, role, accepted_at, accepted_by)
    values (p_org, v_email, p_role, now(), v_user) returning id into v_id;
    return jsonb_build_object('id', v_id, 'status', 'added');
  end if;

  insert into public.invitations (org_id, email, role) values (p_org, v_email, p_role)
  on conflict (org_id, email) where accepted_at is null and revoked_at is null
  do update set role = excluded.role, invited_by = auth.uid(), created_at = now()
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', 'invited');
end;
$$;

create or replace function public.revoke_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_inv public.invitations;
begin
  select * into v_inv from public.invitations where id = p_id;
  if v_inv is null then raise exception 'Invitation not found' using errcode = 'P0002'; end if;
  if not (public.can_manage(v_inv.org_id) or coalesce(v_inv.invited_by = (select auth.uid()), false)) then
    raise exception 'You can''t revoke this invitation' using errcode = '42501';
  end if;
  update public.invitations set revoked_at = now() where id = p_id and accepted_at is null;
end;
$$;
