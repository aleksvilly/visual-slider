# Data model

## Phase 1 persistence

The initial Postgres schema is versioned in `supabase/migrations/202608300001_phase_1_foundation.sql`. The URL-analysis extension is versioned in `supabase/migrations/202608300002_url_analysis.sql`. Migrations are the schema source of truth and are executed in order locally against PostgreSQL 17.5 for policy and workflow validation. The second migration must be applied to production before deploying the URL-assisted admin routes.

Implemented relations:

- `categories` and category-scoped `attribute_definitions`;
- canonical `items` and extensible `item_attribute_values`;
- `sources` with a stable unique slug, adapter version, enablement, display policy, and last-run state;
- observable `ingestion_runs` and per-item `ingestion_errors`;
- versioned `analysis_runs` with structured/raw results, usage metadata, and retry attempt;
- `duplicate_candidates` for a reviewable deduplication decision;
- `admin_metadata` for small platform-level operational settings.

The URL-analysis migration lets `analysis_runs.item_id` remain null until administrator review, then adds:

- `category_id`, so the dynamic analysis schema is reproducible before an item exists;
- `source_url`, so failed fetches and retries remain attributable;
- `runtime_ms`, for admin diagnostics;
- a subject check requiring either an item or source URL.

All semantic values and defaults are constrained to `0..100`. Composite foreign keys ensure an item attribute belongs to the same category as both its item and definition. Source/external identity is unique only when both identifiers exist, so source-less manual items do not collide.

Source credentials do not belong in `sources.configuration`. Every table has RLS enabled and table grants are explicit:

- `anon` can select published categories, enabled definitions, published items, and their enabled values;
- ordinary `authenticated` users get the same public catalog view;
- authenticated JWTs with immutable `app_metadata.role = admin` may operate the protected platform tables;
- operational sources, jobs, errors, analysis, duplicates, and admin metadata have no anonymous access;
- Supabase secret/service-role credentials bypass RLS and therefore remain server-only.

## Category

```ts
CategoryDefinition {
  id
  name
  description
  attributes[]
}
```

Each category owns the semantic vocabulary presented to the user.

Example Pants attributes:

- square
- volume
- business
- experimental
- structured
- minimal

Example Cake attributes could be entirely different:

- geometric
- decorationDensity
- flowerDensity
- asymmetry
- tierCountNormalized
- minimal

The ranking engine remains unchanged.

## Attribute definition

```ts
AttributeDefinition {
  key
  label
  lowLabel
  highLabel
  defaultValue // 0..100
  weight?      // relevance weight
}
```

## Catalog item

```ts
CatalogItem {
  id
  categoryId
  title
  creator?
  sourceSite
  sourceUrl
  imageUrl
  priceLabel?
  buyable?
  note?
  attributes: Record<string, number>
}
```

Future additions may include:

- canonical source ID;
- multiple images;
- currency/price numeric fields;
- availability;
- source policy mode;
- embedding vector reference;
- AI analysis version;
- licensing/action capabilities;
- moderation status;
- creator claim status.

The TypeScript `CatalogItem` remains the stable explorer read model, not a one-to-one database row. A repository adapter is responsible for joining item attributes and mapping canonical database fields into this contract.

The current Pants seed script upserts category, attributes, source, items, and values by stable identities and records an ingestion run. It can be safely rerun after the source-of-truth migration is applied.

## Authenticated manual import

Manual Import uses the existing generic relations rather than Pants-specific columns:

- one shared `sources.slug = manual-admin` adapter record;
- one `ingestion_runs` row per submission;
- one canonical `items` row created or updated by normalized source URL;
- one `item_attribute_values` row per enabled category definition;
- a failed run plus `ingestion_errors` detail for validation/persistence failures.

Create and edit forms store numeric price/currency when supplied and keep publication state separate from semantic values. Archive changes `publication_status`; permanent delete relies on existing foreign-key cascades for item values. All operations use the authenticated user and existing RLS policies, not a service-role client.

## URL-assisted analysis and review

Each Analyze URL submission creates an `analysis_runs` row before network access. Runs for the same category/source increment the existing `attempt` number. Within a run, ordered provider attempts are stored in `raw_result.provider_attempts`; each entry includes provider, requested/actual model, status, runtime, usage, classified error, and error kind. The existing top-level provider/model columns identify the successful provider or the final failed attempt. A failed row stores its stage (`metadata_fetch`, `analysis`, or `persist`) without creating an item.

No third migration is required for provider fallback. Attempt details are bounded diagnostic JSON tied to their parent analysis run, while fields used for list filtering remain in existing indexed columns.

Successful analysis is still not a catalog item. The review page maps category attribute keys back to their definition IDs and reuses the generic item form. Saving invokes the existing observable Manual Import write path, then links `analysis_runs.item_id` and records reviewed attribute provenance through `item_attribute_values.analysis_run_id`. The administrator explicitly chooses `draft`, `review`, or `published`; the default is `review`.

## Important rule

Do not create a database column for every possible global visual adjective. Category-specific attributes should remain extensible.
