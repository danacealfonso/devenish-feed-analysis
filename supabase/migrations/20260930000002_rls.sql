-- Row-level security: every row is scoped to an organization the signed-in user belongs to.

create or replace function public.is_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m where m.org_id = p_org and m.user_id = (select auth.uid())
  );
$$;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.feed_mills enable row level security;
alter table public.locations enable row level security;
alter table public.tolerance_rules enable row level security;
alter table public.uploads enable row level security;
alter table public.samples enable row level security;
alter table public.sample_results enable row level security;
alter table public.diet_formulations enable row level security;

create policy "members read org" on public.organizations
  for select to authenticated using (public.is_member(id));

create policy "read own memberships" on public.memberships
  for select to authenticated using (user_id = (select auth.uid()));

-- Org-scoped tables: members have full access within their org.
do $$
declare t text;
begin
  foreach t in array array['feed_mills', 'locations', 'tolerance_rules', 'uploads', 'samples', 'diet_formulations'] loop
    execute format(
      'create policy "members manage %1$s" on public.%1$I for all to authenticated
         using (public.is_member(org_id)) with check (public.is_member(org_id));', t);
  end loop;
end $$;

create policy "members manage sample_results" on public.sample_results
  for all to authenticated
  using (exists (select 1 from public.samples s where s.id = sample_id and public.is_member(s.org_id)))
  with check (exists (select 1 from public.samples s where s.id = sample_id and public.is_member(s.org_id)));

-- New users join every demo organization so reviewers see data straight away.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.memberships (user_id, org_id, role)
  select new.id, o.id, 'nutritionist' from public.organizations o where o.is_demo
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Raw uploaded files, stored under <org_id>/<upload_id>/<file name>.
insert into storage.buckets (id, name, public)
values ('feed-uploads', 'feed-uploads', false)
on conflict (id) do nothing;

create policy "members read feed uploads" on storage.objects
  for select to authenticated
  using (bucket_id = 'feed-uploads' and public.is_member(((storage.foldername(name))[1])::uuid));

create policy "members write feed uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feed-uploads' and public.is_member(((storage.foldername(name))[1])::uuid));
