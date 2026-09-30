-- Notifications: push (Firebase Cloud Messaging) and email for new uploads, questions and replies,
-- plus "unread" badges for the Data and Questions pages.
--
--   notification_prefs  one row per user: which events, which channels, and where email goes
--   push_tokens         FCM registration tokens, one per browser the user turned push on in
--   seen_markers        when the user last opened Data / Questions for a customer (drives badges)
--   notification_log    what the notify Edge Function sent; also makes sending idempotent

create table public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Null means "my sign-in email".
  email text check (email is null or (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  email_enabled boolean not null default true,
  push_enabled boolean not null default true,
  on_upload boolean not null default true,
  on_question boolean not null default true,
  on_reply boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_user on public.push_tokens (user_id);

create table public.seen_markers (
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  section text not null check (section in ('data', 'questions')),
  seen_at timestamptz not null default now(),
  primary key (user_id, org_id, section)
);

create table public.notification_log (
  id bigint generated always as identity primary key,
  event_type text not null,
  event_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null check (channel in ('push', 'email')),
  status text not null default 'pending',
  detail text,
  created_at timestamptz not null default now(),
  unique (event_type, event_id, user_id, channel)
);

alter table public.notification_prefs enable row level security;
alter table public.push_tokens enable row level security;
alter table public.seen_markers enable row level security;
alter table public.notification_log enable row level security;
-- notification_log: no policies, only the Edge Function (service role) touches it.

create policy "own prefs" on public.notification_prefs
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own push tokens" on public.push_tokens
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own seen markers" on public.seen_markers
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_view(org_id));

-- Unread counts for the sidebar badges. Runs as the caller, so RLS limits it to what they can see.
-- Items the user created themselves never count. Before the first visit, the last 7 days count.
create or replace function public.unread_counts(p_org uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  seen as (
    select
      coalesce(max(seen_at) filter (where section = 'data'), now() - interval '7 days') as data_at,
      coalesce(max(seen_at) filter (where section = 'questions'), now() - interval '7 days') as questions_at
    from public.seen_markers, me
    where user_id = me.uid and org_id = p_org
  )
  select jsonb_build_object(
    'data', (
      select count(*) from public.uploads u, seen, me
      where u.org_id = p_org and u.created_at > seen.data_at and u.uploaded_by is distinct from me.uid
    ),
    'questions', (
      select count(*) from public.questions q, seen, me
      where q.org_id = p_org and q.created_at > seen.questions_at and q.created_by is distinct from me.uid
    ) + (
      select count(*) from public.question_replies r join public.questions q on q.id = r.question_id, seen, me
      where q.org_id = p_org and r.created_at > seen.questions_at and r.created_by is distinct from me.uid
    ),
    'data_seen_at', (select data_at from seen),
    'questions_seen_at', (select questions_at from seen)
  );
$$;
grant execute on function public.unread_counts(uuid) to authenticated;

-- Live badge updates: Realtime delivers these inserts to members (RLS still applies).
do $$
declare t text;
begin
  foreach t in array array['uploads', 'questions', 'question_replies'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
