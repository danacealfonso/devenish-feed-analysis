-- Devenish Insight Portal · Feed analysis schema
-- Raw analyzed/intended values are stored; % of intended and flags are computed on read
-- so tolerance changes apply retroactively without reprocessing.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.memberships (
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  role text not null default 'nutritionist' check (role in ('producer', 'nutritionist')),
  primary key (user_id, org_id)
);

create table public.feed_mills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  mill_id uuid references public.feed_mills (id) on delete set null
);

create table public.tolerance_rules (
  org_id uuid not null references public.organizations (id) on delete cascade,
  nutrient text not null,
  mode text not null default 'pct' check (mode in ('pct', 'abs_min')),
  watch_low numeric,
  watch_high numeric,
  action_low numeric,
  action_high numeric,
  intended_offset numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (org_id, nutrient)
);

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  file_name text not null,
  storage_path text,
  sheets jsonb not null default '[]',
  inserted_count int not null default 0,
  merged_count int not null default 0,
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.samples (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  upload_id uuid references public.uploads (id) on delete set null,
  farm_label text,
  external_id text,
  sample_no text,
  diet_code text,
  diet_key text,
  phase text,
  sampled_on date,
  source text not null check (source in ('lab', 'nir')),
  lab_or_instrument text,
  dm numeric,
  source_sheet text,
  source_ref text,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (org_id, dedupe_key)
);
create index samples_org_date on public.samples (org_id, sampled_on desc);
create index samples_org_diet on public.samples (org_id, diet_key);
create index samples_org_sample_no on public.samples (org_id, sample_no);

create table public.sample_results (
  sample_id uuid not null references public.samples (id) on delete cascade,
  nutrient text not null,
  basis text not null default 'as_received' check (basis in ('as_received', 'dry_matter')),
  analyzed numeric,
  intended numeric,
  intended_offset numeric,
  sheet_pct numeric,
  primary key (sample_id, nutrient, basis)
);

-- Formulated values per diet, collected from any upload that carries them, used to match raw lab/NIR results.
create table public.diet_formulations (
  org_id uuid not null references public.organizations (id) on delete cascade,
  diet_key text not null,
  effective_from date not null,
  nutrient text not null,
  intended numeric not null,
  primary key (org_id, diet_key, effective_from, nutrient)
);
