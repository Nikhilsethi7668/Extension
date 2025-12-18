-- Multi-tenant schema for dealership platform (Supabase/Postgres)

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text generated always as (regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) stored,
  -- per-tenant AI and branding
  gemini_api_key text, -- optional per-tenant key (encrypted at app layer)
  custom_watermark_url text,
  domain_to_scrape text,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  -- if using Supabase Auth, map to auth.users and keep this as profile table
  auth_user_id uuid unique
);

create table if not exists memberships (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner','admin','agent','superadmin','dealeradmin','salesagent')),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('openai','gemini','anthropic')),
  key_alias text not null,
  encrypted_key text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists scrape_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  url text not null,
  label text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists scrape_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  source_id uuid references scrape_sources(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  requested_by uuid references users(id),
  started_at timestamptz,
  finished_at timestamptz,
  error text
);

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  external_id text,
  vin text,
  year int,
  make text,
  model text,
  trim text,
  mileage int,
  price numeric,
  body_type text,
  color text,
  location text,
  raw jsonb not null default '{}', -- original scraped payload
  normalized jsonb not null default '{}', -- standardized cleaned payload
  ai_title text,
  ai_description text,
  ai_variants jsonb not null default '[]', -- array of alt titles/descriptions for variety
  status text not null default 'review' check (status in ('review','ready','posted','archived','sold_pending_removal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vehicle_images (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  kind text not null default 'original' check (kind in ('original','refined','watermarked')),
  url text not null,
  width int,
  height int,
  created_at timestamptz not null default now()
);

create table if not exists postings (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid references users(id),
  channel text not null check (channel in ('facebook_marketplace')),
  status text not null default 'pending' check (status in ('pending','published','failed','removed')),
  listing_url text,
  published_at timestamptz,
  removed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists fb_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  label text not null,
  chrome_profile_dir text, -- e.g., "Profile 2"
  assigned_user uuid references users(id),
  facebook_id text,
  created_at timestamptz not null default now()
);

-- Optional explicit chrome profiles table if keeping terminology aligned
create table if not exists chrome_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid references users(id),
  profile_name text not null, -- e.g., "Profile 4"
  facebook_id text,
  created_at timestamptz not null default now()
);

create table if not exists activity_logs (
  id bigserial primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references users(id),
  subject text not null, -- e.g., 'vehicle','posting','job','user'
  subject_id text,
  action text not null, -- e.g., 'create','update','post','refine','delete'
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_memberships_user on memberships(user_id);
create index if not exists idx_vehicles_org on vehicles(org_id);
create index if not exists idx_postings_vehicle on postings(vehicle_id);
create index if not exists idx_activity_org on activity_logs(org_id);
create index if not exists idx_chrome_profiles_org on chrome_profiles(org_id);

-- Note: Define RLS policies per table in Supabase to enforce tenancy.
