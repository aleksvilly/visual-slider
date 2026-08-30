import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migrationPath = new URL(
  '../supabase/migrations/202608300001_phase_1_foundation.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');
const db = new PGlite();

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create function auth.jwt()
  returns jsonb
  language sql
  stable
  set search_path = ''
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb,
      '{}'::jsonb
    )
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.jwt() to anon, authenticated;
`);

await db.exec(migration);

const version = await db.query<{ server_version: string }>('show server_version');
const tables = await db.query<{ count: number }>(`
  select count(*)::int as count
  from information_schema.tables
  where table_schema = 'public'
    and table_type = 'BASE TABLE'
`);
const policies = await db.query<{ count: number }>(`
  select count(*)::int as count
  from pg_policies
  where schemaname = 'public'
`);
const rlsTables = await db.query<{ count: number }>(`
  select count(*)::int as count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relrowsecurity
`);

if (tables.rows[0]?.count !== 10) {
  throw new Error(`Expected 10 public tables, found ${tables.rows[0]?.count ?? 0}.`);
}
if (rlsTables.rows[0]?.count !== 10) {
  throw new Error(`Expected RLS on 10 tables, found ${rlsTables.rows[0]?.count ?? 0}.`);
}
if (policies.rows[0]?.count !== 14) {
  throw new Error(`Expected 14 RLS policies, found ${policies.rows[0]?.count ?? 0}.`);
}

await db.exec(`
  insert into public.categories (slug, name, status)
  values ('published-test', 'Published', 'published'), ('draft-test', 'Draft', 'draft');
`);

await db.exec('set role anon');
const anonymousCategories = await db.query<{ slug: string }>(
  'select slug from public.categories order by slug',
);
if (anonymousCategories.rows.map((row) => row.slug).join(',') !== 'published-test') {
  throw new Error('Anonymous catalog policy exposed a non-published category.');
}

let anonymousSourcesDenied = false;
try {
  await db.query('select id from public.sources');
} catch {
  anonymousSourcesDenied = true;
}
if (!anonymousSourcesDenied) {
  throw new Error('Anonymous role unexpectedly has access to sources.');
}

await db.exec(`
  reset role;
  select set_config('request.jwt.claims', '{}', false);
  set role authenticated;
`);
const ordinaryCategories = await db.query<{ count: number }>(
  'select count(*)::int as count from public.categories',
);
if (ordinaryCategories.rows[0]?.count !== 1) {
  throw new Error('Ordinary authenticated users must see only the published catalog.');
}
let ordinaryWriteDenied = false;
try {
  await db.exec(`
    insert into public.sources (slug, name, adapter_type, adapter_version)
    values ('ordinary-denied', 'Denied', 'test', '1');
  `);
} catch {
  ordinaryWriteDenied = true;
}
if (!ordinaryWriteDenied) {
  throw new Error('Ordinary authenticated user unexpectedly wrote to sources.');
}
let ordinaryItemWriteDenied = false;
try {
  await db.exec(`
    insert into public.items (
      public_id, category_id, title, source_site, image_url, publication_status
    )
    select 'ordinary-denied-item', id, 'Denied item', 'Test',
      'https://example.com/denied.jpg', 'published'
    from public.categories where slug = 'published-test';
  `);
} catch {
  ordinaryItemWriteDenied = true;
}
if (!ordinaryItemWriteDenied) {
  throw new Error('Ordinary authenticated user unexpectedly wrote to catalog items.');
}

await db.exec(`
  reset role;
  select set_config(
    'request.jwt.claims',
    '{"app_metadata":{"role":"admin"}}',
    false
  );
  set role authenticated;
`);
const adminCategories = await db.query<{ count: number }>(
  'select count(*)::int as count from public.categories',
);
if (adminCategories.rows[0]?.count !== 2) {
  throw new Error('Authenticated admin policy could not read draft catalog data.');
}
await db.exec(`
  insert into public.sources (slug, name, adapter_type, adapter_version)
  values ('admin-source', 'Admin source', 'test', '1');

  insert into public.attribute_definitions (
    category_id, key, label, low_label, high_label
  )
  select id, 'test-attribute', 'Test attribute', 'Low', 'High'
  from public.categories where slug = 'published-test';

  insert into public.ingestion_runs (
    source_id, status, adapter_version, started_at, finished_at, imported_count
  )
  select id, 'succeeded', '1', now(), now(), 1
  from public.sources where slug = 'admin-source';

  insert into public.items (
    public_id, category_id, source_id, source_external_id, title,
    source_site, canonical_source_url, image_url, publication_status
  )
  select
    'admin-created-item', categories.id, sources.id, 'admin-created-item',
    'Admin created', 'Test source', 'https://example.com/admin-created-item',
    'https://example.com/image.jpg', 'published'
  from public.categories
  cross join public.sources
  where categories.slug = 'published-test' and sources.slug = 'admin-source';

  insert into public.item_attribute_values (item_id, attribute_id, category_id, value)
  select items.id, attributes.id, categories.id, 72
  from public.items
  join public.categories on categories.id = items.category_id
  join public.attribute_definitions attributes on attributes.category_id = categories.id
  where items.public_id = 'admin-created-item' and attributes.key = 'test-attribute';
`);

await db.exec('reset role; set role anon');
const visiblePublishedItem = await db.query<{ count: number }>(`
  select count(*)::int as count from public.items where public_id = 'admin-created-item'
`);
if (visiblePublishedItem.rows[0]?.count !== 1) {
  throw new Error('An admin-created published item was not visible to the public catalog role.');
}

await db.exec(`
  reset role;
  select set_config(
    'request.jwt.claims',
    '{"app_metadata":{"role":"admin"}}',
    false
  );
  set role authenticated;
  update public.items
  set title = 'Admin edited', publication_status = 'archived'
  where public_id = 'admin-created-item';
`);
const editedItem = await db.query<{ title: string; publication_status: string }>(`
  select title, publication_status from public.items where public_id = 'admin-created-item'
`);
if (
  editedItem.rows[0]?.title !== 'Admin edited' ||
  editedItem.rows[0]?.publication_status !== 'archived'
) {
  throw new Error('Admin could not edit and archive a catalog item.');
}

await db.exec('reset role; set role anon');
const hiddenArchivedItem = await db.query<{ count: number }>(`
  select count(*)::int as count from public.items where public_id = 'admin-created-item'
`);
if (hiddenArchivedItem.rows[0]?.count !== 0) {
  throw new Error('An archived item remained visible to the public catalog role.');
}

await db.exec(`
  reset role;
  select set_config(
    'request.jwt.claims',
    '{"app_metadata":{"role":"admin"}}',
    false
  );
  set role authenticated;
  delete from public.items where public_id = 'admin-created-item';
`);

await db.close();
console.log(
  `Validated ${migrationPath.pathname.split('/').at(-1)} on PostgreSQL ${version.rows[0]?.server_version}: ` +
    `${tables.rows[0]?.count} tables, ${rlsTables.rows[0]?.count} RLS-enabled, ${policies.rows[0]?.count} policies; ` +
    'admin create/edit/archive/delete and public visibility checks passed.',
);
