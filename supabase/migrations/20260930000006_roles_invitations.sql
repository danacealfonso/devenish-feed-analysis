-- Customer access: roles that mean something, invitations, profiles and Devenish admins.
--
--   admin         Devenish staff (platform_admins): every customer, creates customers, manages anyone.
--   nutritionist  member role: manages a customer's settings (tolerances, locations, mills) and team.
--   producer      member role: the customer's own team. Views everything, uploads, asks questions,
--                 invites other producers. Cannot change settings.
--
-- Writes from producers go through security-definer RPCs that check permissions explicitly.

------------------------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Emails pre-authorised as Devenish admins; granted when that address signs up and is confirmed.
create table public.admin_emails (
  email text primary key check (email = lower(email))
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role text not null check (role in ('producer', 'nutritionist')),
  invited_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);
create unique index invitations_one_pending on public.invitations (org_id, email)
  where accepted_at is null and revoked_at is null;
create index invitations_email_pending on public.invitations (email)
  where accepted_at is null and revoked_at is null;

insert into public.profiles (id, email, full_name)
select id, lower(email), raw_user_meta_data ->> 'full_name' from auth.users where email is not null
on conflict (id) do nothing;

------------------------------------------------------------------------------------------------
-- Permission helpers
------------------------------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

create or replace function public.org_role(p_org uuid)
returns text language sql stable security definer set search_path = '' as $$
  select role from public.memberships where org_id = p_org and user_id = (select auth.uid());
$$;

create or replace function public.can_view(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.is_member(p_org);
$$;

create or replace function public.can_manage(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.org_role(p_org) = 'nutritionist';
$$;

create or replace function public.shares_org(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships a join public.memberships b on a.org_id = b.org_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  );
$$;

------------------------------------------------------------------------------------------------
-- Policies (replacing the "any member can do anything" policies)
------------------------------------------------------------------------------------------------
alter table public.platform_admins enable row level security;
alter table public.admin_emails enable row level security;
alter table public.profiles enable row level security;
alter table public.invitations enable row level security;

create policy "see own admin row" on public.platform_admins
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

create policy "see profiles of teammates" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or public.is_admin() or public.shares_org(id));

create policy "see invitations" on public.invitations
  for select to authenticated using (public.can_view(org_id));

drop policy "members read org" on public.organizations;
create policy "view orgs" on public.organizations
  for select to authenticated using (public.can_view(id));

drop policy "read own memberships" on public.memberships;
create policy "view memberships" on public.memberships
  for select to authenticated using (user_id = (select auth.uid()) or public.can_view(org_id));

do $$
declare t text;
begin
  foreach t in array array['feed_mills', 'locations', 'tolerance_rules', 'uploads', 'samples', 'diet_formulations'] loop
    execute format('drop policy "members manage %1$s" on public.%1$I', t);
    execute format('create policy "view %1$s" on public.%1$I for select to authenticated using (public.can_view(org_id))', t);
    execute format(
      'create policy "manage %1$s" on public.%1$I for all to authenticated
         using (public.can_manage(org_id)) with check (public.can_manage(org_id))', t);
  end loop;
end $$;

drop policy "members manage sample_results" on public.sample_results;
create policy "view sample_results" on public.sample_results
  for select to authenticated
  using (exists (select 1 from public.samples s where s.id = sample_id and public.can_view(s.org_id)));
create policy "manage sample_results" on public.sample_results
  for all to authenticated
  using (exists (select 1 from public.samples s where s.id = sample_id and public.can_manage(s.org_id)))
  with check (exists (select 1 from public.samples s where s.id = sample_id and public.can_manage(s.org_id)));

drop policy "members manage questions" on public.questions;
create policy "view questions" on public.questions
  for select to authenticated using (public.can_view(org_id));
create policy "ask questions" on public.questions
  for insert to authenticated with check (public.can_view(org_id) and created_by = (select auth.uid()));
create policy "update questions" on public.questions
  for update to authenticated using (public.can_view(org_id)) with check (public.can_view(org_id));
create policy "delete questions" on public.questions
  for delete to authenticated using (public.can_manage(org_id));

drop policy "members read replies" on public.question_replies;
drop policy "members add replies" on public.question_replies;
create policy "view replies" on public.question_replies
  for select to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id and public.can_view(q.org_id)));
create policy "add replies" on public.question_replies
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.questions q where q.id = question_id and public.can_view(q.org_id))
  );

drop policy "members read feed uploads" on storage.objects;
drop policy "members write feed uploads" on storage.objects;
create policy "view feed uploads" on storage.objects
  for select to authenticated
  using (bucket_id = 'feed-uploads' and public.can_view(((storage.foldername(name))[1])::uuid));
create policy "add feed uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feed-uploads' and public.can_view(((storage.foldername(name))[1])::uuid));

------------------------------------------------------------------------------------------------
-- Import: producers upload too, so this runs as definer with explicit checks.
------------------------------------------------------------------------------------------------
create or replace function public.import_feed_upload(
  p_org uuid,
  p_upload jsonb,
  p_samples jsonb,
  p_formulations jsonb default '[]'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upload uuid;
  v_sample jsonb;
  v_sample_id uuid;
  v_inserted boolean;
  v_new int := 0;
  v_merged int := 0;
begin
  if not public.can_view(p_org) then
    raise exception 'You don''t have access to this customer' using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_samples) e
    where not exists (
      select 1 from public.locations l where l.id = (e ->> 'location_id')::uuid and l.org_id = p_org
    )
  ) then
    raise exception 'Every sample must belong to one of this customer''s locations' using errcode = '22023';
  end if;

  insert into public.uploads (org_id, file_name, storage_path, sheets, uploaded_by)
  values (p_org, p_upload ->> 'file_name', p_upload ->> 'storage_path', coalesce(p_upload -> 'sheets', '[]'), auth.uid())
  returning id into v_upload;

  for v_sample in select * from jsonb_array_elements(p_samples) loop
    insert into public.samples as s (
      org_id, location_id, upload_id, farm_label, external_id, sample_no, diet_code, diet_key, phase,
      sampled_on, source, lab_or_instrument, dm, source_sheet, source_ref, dedupe_key
    ) values (
      p_org,
      (v_sample ->> 'location_id')::uuid,
      v_upload,
      v_sample ->> 'farm_label',
      v_sample ->> 'external_id',
      v_sample ->> 'sample_no',
      v_sample ->> 'diet_code',
      v_sample ->> 'diet_key',
      v_sample ->> 'phase',
      (v_sample ->> 'sampled_on')::date,
      v_sample ->> 'source',
      v_sample ->> 'lab_or_instrument',
      (v_sample ->> 'dm')::numeric,
      v_sample ->> 'source_sheet',
      v_sample ->> 'source_ref',
      v_sample ->> 'dedupe_key'
    )
    on conflict (org_id, dedupe_key) do update
      set farm_label = coalesce(s.farm_label, excluded.farm_label),
          dm = coalesce(s.dm, excluded.dm)
    returning id, (xmax = 0) into v_sample_id, v_inserted;

    if v_inserted then v_new := v_new + 1; else v_merged := v_merged + 1; end if;

    insert into public.sample_results as r (sample_id, nutrient, basis, analyzed, intended, intended_offset, sheet_pct)
    select v_sample_id, x.nutrient, coalesce(x.basis, 'as_received'), x.analyzed, x.intended, x.intended_offset, x.sheet_pct
    from jsonb_to_recordset(v_sample -> 'results')
      as x (nutrient text, basis text, analyzed numeric, intended numeric, intended_offset numeric, sheet_pct numeric)
    on conflict (sample_id, nutrient, basis) do update
      set analyzed = coalesce(r.analyzed, excluded.analyzed),
          intended = coalesce(r.intended, excluded.intended),
          intended_offset = coalesce(r.intended_offset, excluded.intended_offset),
          sheet_pct = coalesce(r.sheet_pct, excluded.sheet_pct);
  end loop;

  insert into public.diet_formulations (org_id, diet_key, effective_from, nutrient, intended)
  select p_org, f.diet_key, f.effective_from, f.nutrient, f.intended
  from jsonb_to_recordset(p_formulations) as f (diet_key text, effective_from date, nutrient text, intended numeric)
  on conflict (org_id, diet_key, effective_from, nutrient) do update set intended = excluded.intended;

  update public.uploads set inserted_count = v_new, merged_count = v_merged where id = v_upload;

  return jsonb_build_object('upload_id', v_upload, 'inserted', v_new, 'merged', v_merged);
end;
$$;

------------------------------------------------------------------------------------------------
-- Invitations and team management
------------------------------------------------------------------------------------------------
create or replace function public._claim_invitations_for(p_user uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_count int := 0;
begin
  select lower(email) into v_email from auth.users where id = p_user and email_confirmed_at is not null;
  if v_email is null then return 0; end if;

  insert into public.memberships (user_id, org_id, role)
  select p_user, i.org_id, i.role from public.invitations i
  where i.email = v_email and i.accepted_at is null and i.revoked_at is null
  on conflict (user_id, org_id) do update set role = excluded.role;
  get diagnostics v_count = row_count;

  update public.invitations set accepted_at = now(), accepted_by = p_user
  where email = v_email and accepted_at is null and revoked_at is null;

  insert into public.platform_admins (user_id)
  select p_user from public.admin_emails where email = v_email
  on conflict do nothing;

  return v_count;
end;
$$;
revoke execute on function public._claim_invitations_for(uuid) from public, anon, authenticated;

create or replace function public.claim_invitations()
returns int language sql security definer set search_path = '' as $$
  select public._claim_invitations_for((select auth.uid()));
$$;

create or replace function public.invite_member(p_org uuid, p_email text, p_role text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_my_role text := public.org_role(p_org);
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
  if not (public.can_manage(v_inv.org_id) or v_inv.invited_by = (select auth.uid())) then
    raise exception 'You can''t revoke this invitation' using errcode = '42501';
  end if;
  update public.invitations set revoked_at = now() where id = p_id and accepted_at is null;
end;
$$;

create or replace function public.set_member_role(p_org uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_role not in ('producer', 'nutritionist') then raise exception 'Unknown role %', p_role using errcode = '22023'; end if;
  if not public.can_manage(p_org) then raise exception 'Only a nutritionist or admin can change roles' using errcode = '42501'; end if;
  update public.memberships set role = p_role where org_id = p_org and user_id = p_user;
end;
$$;

create or replace function public.remove_member(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.can_manage(p_org) or p_user = (select auth.uid())) then
    raise exception 'Only a nutritionist or admin can remove people' using errcode = '42501';
  end if;
  delete from public.memberships where org_id = p_org and user_id = p_user;
end;
$$;

create or replace function public.create_customer(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if not public.is_admin() then raise exception 'Only Devenish admins can create customers' using errcode = '42501'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Customer name is required' using errcode = '22023'; end if;
  insert into public.organizations (name) values (trim(p_name)) returning id into v_org;
  insert into public.tolerance_rules (org_id, nutrient, mode, watch_low, watch_high, action_low, action_high, intended_offset)
  values
    (v_org, 'cp', 'pct', 98, 105, 85, 115, 0),
    (v_org, 'ca', 'pct', 95, 108, 85, 125, 0),
    (v_org, 'p', 'pct', 98, 105, 85, 125, 0),
    (v_org, 'na', 'pct', 90, 110, 85, 130, 0),
    (v_org, 'nacl', 'pct', 90, 110, 85, 130, 0),
    (v_org, 'fat', 'pct', 90, 115, 75, 140, 0),
    (v_org, 'fiber', 'pct', 85, 115, null, null, 0),
    (v_org, 'moisture', 'pct', 90, 110, null, null, 0),
    (v_org, 'zn', 'abs_min', 110, null, 100, null, 0),
    (v_org, 'cu', 'abs_min', 25, null, 20, null, 0);
  return v_org;
end;
$$;

------------------------------------------------------------------------------------------------
-- Auth hooks: profile sync, demo access, invitation claim
------------------------------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do update set email = excluded.email, full_name = coalesce(excluded.full_name, public.profiles.full_name);

  -- Invited people join their customer; everyone else gets the demo customers so the prototype is explorable.
  if not exists (
    select 1 from public.invitations
    where email = lower(new.email) and accepted_at is null and revoked_at is null
  ) then
    insert into public.memberships (user_id, org_id, role)
    select new.id, o.id, 'nutritionist' from public.organizations o where o.is_demo
    on conflict do nothing;
  end if;

  perform public._claim_invitations_for(new.id);
  return new;
end;
$$;

create or replace function public.handle_user_updated()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
  set email = lower(new.email), full_name = coalesce(new.raw_user_meta_data ->> 'full_name', full_name)
  where id = new.id;
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    perform public._claim_invitations_for(new.id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update of email, email_confirmed_at, raw_user_meta_data on auth.users
  for each row execute function public.handle_user_updated();

grant execute on function public.claim_invitations(), public.invite_member(uuid, text, text),
  public.revoke_invitation(uuid), public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid),
  public.create_customer(text), public.is_admin(), public.import_feed_upload(uuid, jsonb, jsonb, jsonb)
  to authenticated;
