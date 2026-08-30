-- Visual Slider Phase 1 platform foundation.
-- PostgreSQL is the source of truth; Supabase is the first managed target.
-- Target: a fresh Supabase project on PostgreSQL 17.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

comment on function public.is_admin() is
  'Authorization helper. Admin role must be stored in immutable auth app_metadata, never user_metadata.';

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  eyebrow text not null default '',
  description text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  ranking_config jsonb not null default '{}'::jsonb,
  constraint_schema jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attribute_definitions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  key text not null,
  label text not null,
  low_label text not null,
  high_label text not null,
  default_value numeric(5,2) not null default 50
    check (default_value between 0 and 100),
  weight numeric(7,4) not null default 1 check (weight > 0),
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, key),
  unique (id, category_id)
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  adapter_type text not null,
  base_url text,
  enabled boolean not null default false,
  display_policy text not null default 'LINK_ONLY'
    check (display_policy in ('LINK_ONLY', 'EMBED', 'PREVIEW', 'LICENSED', 'BUYABLE')),
  adapter_version text not null,
  configuration jsonb not null default '{}'::jsonb,
  status text not null default 'idle'
    check (status in ('idle', 'running', 'healthy', 'degraded', 'disabled')),
  last_run_at timestamptz,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.sources.configuration is
  'Non-secret adapter configuration only. Credentials belong in server-side secret storage.';

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete restrict,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  adapter_version text not null,
  started_at timestamptz,
  finished_at timestamptz,
  imported_count integer not null default 0 check (imported_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  error_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  category_id uuid not null references public.categories(id) on delete restrict,
  source_id uuid references public.sources(id) on delete restrict,
  source_external_id text,
  title text not null,
  creator text,
  source_site text not null,
  canonical_source_url text,
  image_url text not null,
  price_amount numeric(14,2),
  price_currency text,
  price_label text,
  buyable boolean not null default false,
  availability boolean,
  note text,
  structured_metadata jsonb not null default '{}'::jsonb,
  publication_status text not null default 'draft'
    check (publication_status in ('draft', 'review', 'published', 'rejected', 'archived')),
  review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed', 'approved', 'needs_review', 'rejected')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, category_id)
);

create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  job_id text,
  provider text not null,
  model text not null,
  schema_version text not null,
  prompt_version text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempt integer not null default 1 check (attempt > 0),
  started_at timestamptz,
  finished_at timestamptz,
  structured_result jsonb,
  raw_result jsonb,
  usage_metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.item_attribute_values (
  item_id uuid not null,
  attribute_id uuid not null,
  category_id uuid not null references public.categories(id) on delete cascade,
  value numeric(5,2) not null check (value between 0 and 100),
  confidence numeric(5,4) check (confidence between 0 and 1),
  analysis_run_id uuid references public.analysis_runs(id) on delete set null,
  source text not null default 'manual'
    check (source in ('manual', 'imported', 'analysis', 'corrected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_id, attribute_id),
  foreign key (item_id, category_id)
    references public.items(id, category_id) on delete cascade,
  foreign key (attribute_id, category_id)
    references public.attribute_definitions(id, category_id) on delete cascade
);

create table public.ingestion_errors (
  id uuid primary key default gen_random_uuid(),
  ingestion_run_id uuid not null references public.ingestion_runs(id) on delete cascade,
  source_external_id text,
  stage text not null,
  code text,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  candidate_item_id uuid not null references public.items(id) on delete cascade,
  reason text not null,
  confidence numeric(5,4) check (confidence between 0 and 1),
  status text not null default 'open'
    check (status in ('open', 'confirmed', 'dismissed', 'merged')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (item_id <> candidate_item_id),
  unique (item_id, candidate_item_id)
);

create table public.admin_metadata (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

create index items_category_publication_idx
  on public.items (category_id, publication_status);
create index items_source_idx on public.items (source_id);
create unique index items_source_external_identity_idx
  on public.items (source_id, source_external_id)
  where source_id is not null and source_external_id is not null;
create index items_canonical_source_url_idx
  on public.items (canonical_source_url)
  where canonical_source_url is not null;
create index ingestion_runs_source_created_idx
  on public.ingestion_runs (source_id, created_at desc);
create index analysis_runs_item_created_idx
  on public.analysis_runs (item_id, created_at desc);
create index ingestion_errors_run_idx
  on public.ingestion_errors (ingestion_run_id, created_at desc);
create index duplicate_candidates_status_idx
  on public.duplicate_candidates (status, created_at desc);

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();
create trigger attribute_definitions_set_updated_at
before update on public.attribute_definitions
for each row execute function public.set_updated_at();
create trigger sources_set_updated_at
before update on public.sources
for each row execute function public.set_updated_at();
create trigger items_set_updated_at
before update on public.items
for each row execute function public.set_updated_at();
create trigger item_attribute_values_set_updated_at
before update on public.item_attribute_values
for each row execute function public.set_updated_at();
create trigger admin_metadata_set_updated_at
before update on public.admin_metadata
for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.attribute_definitions enable row level security;
alter table public.sources enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.items enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.item_attribute_values enable row level security;
alter table public.ingestion_errors enable row level security;
alter table public.duplicate_candidates enable row level security;
alter table public.admin_metadata enable row level security;

-- Supabase projects may grant broad table privileges by default. Make the Data
-- API surface explicit: signed-out users can only select public catalog rows;
-- signed-in users receive table privileges, but RLS limits non-admins to the
-- same public rows and permits app_metadata.role=admin to operate the admin area.
revoke all on table
  public.categories,
  public.attribute_definitions,
  public.sources,
  public.ingestion_runs,
  public.items,
  public.analysis_runs,
  public.item_attribute_values,
  public.ingestion_errors,
  public.duplicate_candidates,
  public.admin_metadata
from anon, authenticated;

grant select on table
  public.categories,
  public.attribute_definitions,
  public.items,
  public.item_attribute_values
to anon, authenticated;

grant select, insert, update, delete on table
  public.categories,
  public.attribute_definitions,
  public.sources,
  public.ingestion_runs,
  public.items,
  public.analysis_runs,
  public.item_attribute_values,
  public.ingestion_errors,
  public.duplicate_candidates,
  public.admin_metadata
to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create policy "public categories are readable"
  on public.categories for select
  to anon, authenticated
  using (status = 'published');
create policy "public attributes are readable"
  on public.attribute_definitions for select
  to anon, authenticated
  using (
    enabled and exists (
      select 1 from public.categories
      where categories.id = attribute_definitions.category_id
        and categories.status = 'published'
    )
  );
create policy "published items are readable"
  on public.items for select
  to anon, authenticated
  using (
    publication_status = 'published'
    and exists (
      select 1 from public.categories
      where categories.id = items.category_id
        and categories.status = 'published'
    )
  );
create policy "published item attributes are readable"
  on public.item_attribute_values for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.items
      join public.categories on categories.id = items.category_id
      where items.id = item_attribute_values.item_id
        and items.publication_status = 'published'
        and categories.status = 'published'
    )
    and exists (
      select 1 from public.attribute_definitions
      where attribute_definitions.id = item_attribute_values.attribute_id
        and attribute_definitions.enabled
    )
  );

create policy "admins manage categories"
  on public.categories for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "admins manage attributes"
  on public.attribute_definitions for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "admins manage sources"
  on public.sources for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "admins manage ingestion runs"
  on public.ingestion_runs for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "admins manage items"
  on public.items for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "admins manage analysis runs"
  on public.analysis_runs for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "admins manage item attributes"
  on public.item_attribute_values for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "admins manage ingestion errors"
  on public.ingestion_errors for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "admins manage duplicate candidates"
  on public.duplicate_candidates for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "admins manage metadata"
  on public.admin_metadata for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
