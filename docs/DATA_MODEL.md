# Data model

## Phase 1 persistence

The initial Postgres schema is versioned in `supabase/migrations/202608300001_phase_1_foundation.sql`. This is the only migration to apply to the fresh `yzayxussrpreiyknlnhi` Supabase project. It has been executed locally against PostgreSQL 17.5; it has not been remotely applied.

Implemented relations:

- `categories` and category-scoped `attribute_definitions`;
- canonical `items` and extensible `item_attribute_values`;
- `sources` with a stable unique slug, adapter version, enablement, display policy, and last-run state;
- observable `ingestion_runs` and per-item `ingestion_errors`;
- versioned `analysis_runs` with structured/raw results, usage metadata, and retry attempt;
- `duplicate_candidates` for a reviewable deduplication decision;
- `admin_metadata` for small platform-level operational settings.

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

## Important rule

Do not create a database column for every possible global visual adjective. Category-specific attributes should remain extensible.
