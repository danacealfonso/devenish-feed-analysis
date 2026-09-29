-- Questions: threads between a producer's team and their nutritionist, optionally tied to a location/diet.

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  diet_key text,
  subject text not null check (length(subject) between 1 and 200),
  body text not null check (length(body) between 1 and 5000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index questions_org_updated on public.questions (org_id, updated_at desc);

create table public.question_replies (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  body text not null check (length(body) between 1 and 5000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  author_name text,
  created_at timestamptz not null default now()
);
create index question_replies_question on public.question_replies (question_id, created_at);

alter table public.questions enable row level security;
alter table public.question_replies enable row level security;

create policy "members manage questions" on public.questions
  for all to authenticated
  using (public.is_member(org_id)) with check (public.is_member(org_id));

create policy "members read replies" on public.question_replies
  for select to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id and public.is_member(q.org_id)));

create policy "members add replies" on public.question_replies
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.questions q where q.id = question_id and public.is_member(q.org_id))
  );

-- Keep the thread's updated_at current so the list sorts by latest activity.
create or replace function public.touch_question()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.questions set updated_at = now() where id = new.question_id;
  return new;
end;
$$;

create trigger on_question_reply
  after insert on public.question_replies
  for each row execute function public.touch_question();
