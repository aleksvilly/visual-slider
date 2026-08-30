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
`);

await db.close();
console.log(
  `Validated ${migrationPath.pathname.split('/').at(-1)} on PostgreSQL ${version.rows[0]?.server_version}: ` +
    `${tables.rows[0]?.count} tables, ${rlsTables.rows[0]?.count} RLS-enabled, ${policies.rows[0]?.count} policies.`,
);
