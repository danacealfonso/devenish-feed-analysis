-- Usage log for the AI assistant Edge Function, used to enforce daily caps
-- (the demo logins are public, so every account must be rate-limited).
-- Written only by the Edge Function with the service role; no client access.

create table public.assistant_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete set null,
  created_at timestamptz not null default now(),
  model text,
  input_tokens int,
  cache_read_tokens int,
  output_tokens int,
  stop_reason text
);
create index assistant_usage_user_time on public.assistant_usage (user_id, created_at desc);
create index assistant_usage_time on public.assistant_usage (created_at desc);

alter table public.assistant_usage enable row level security;
-- No policies: only the service role (which bypasses RLS) reads or writes this table.
