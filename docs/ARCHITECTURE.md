# Architecture

## Current implementation

```text
Astro server build on Vercel
  ├─ public /pants explorer
  │   └─ server repository selector
  │       ├─ SupabaseCatalogRepository when configured
  │       └─ checked-in seed fallback when variables are absent
  ├─ middleware-protected /admin
  │   ├─ Supabase Auth cookie session
  │   ├─ app_metadata.role = admin
  │   └─ read-only operational views + Ranking Lab
  ├─ Vue VisualExplorer + Ranking Lab islands
  │   └─ shared ranking.ts + score explanations
  └─ LocalStorage moodboard

versioned Postgres/Supabase migration
  ├─ canonical catalog/category/source tables
  ├─ ingestion + analysis run history
  ├─ errors + duplicate review queue
  ├─ explicit grants + RLS on every public table
  └─ published catalog reads / authenticated admin management
```

This is the second Phase 1 slice. Runtime catalog reads, Vercel server output, and the admin authentication boundary are connected. Admin views remain read-only until authenticated write forms and server actions are implemented.

## Target platform architecture

```text
                           VISUAL SLIDER

              ┌─────────────────────────────────┐
              │            Web app              │
              │                                 │
              │  Public explorer     /admin     │
              │  sliders / results   control UI │
              └──────────────┬──────────────────┘
                             │
                         API / server
                             │
                   ┌─────────┴─────────┐
                   │                   │
               Postgres          job orchestration
                   │                   │
          canonical catalog            │
          categories / attrs           │
          sources / runs               │
          analysis metadata            │
                   │                   │
                   └─────────┬─────────┘
                             │
                      Ranking service/core
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
  soft semantic score   hard constraints   optional similarity
                                               / embeddings


INGESTION

sources / APIs / feeds / public pages / creator uploads
                             │
                        source adapter
                             │
                           raw item
                             │
                         normalizer
                             │
                        canonical item
                             │
                         deduplication
                             │
                    offline AI analysis
                             │
                  structured attributes
                             │
                     review / publish
```

## Working deployment direction

The working implementation direction is:

- Astro 7 + Vue for the application UI;
- Vercel server output through the official adapter;
- Postgres as the source of truth;
- Supabase as the preferred initial managed Postgres/Auth/Storage provider unless a concrete implementation reason favors another provider;
- GitHub remains the source repository and deployment trigger;
- GitHub Actions validates the migration, types, and production build; Vercel is now the application deployment target.

Core domain and ranking code should not depend directly on one infrastructure vendor.

### Repository transition

The explorer consumes a small `CatalogRepository` contract that returns a category definition and its canonical items. Implementations are selected on the server/build side:

```text
VisualExplorer
      ↑ stable explorer contract
Astro category route
      ↑ CatalogRepository
      ├─ seed repository (missing-variable fallback)
      └─ Supabase/Postgres repository (configured runtime)
```

Do not import Supabase or another provider into `VisualExplorer` or `ranking.ts`. Provider-specific query and row-mapping code belongs in the Postgres repository adapter.

The repository uses the low-privilege publishable key on the server and therefore remains subject to public RLS. Configuration is accepted only when `SUPABASE_PROJECT_REF` and `SUPABASE_URL` both identify `yzayxussrpreiyknlnhi`. Database errors do not silently fall back to seed data; fallback is only for intentionally absent environment variables.

## Core domain model

### Category

A category defines the discovery vocabulary and capabilities for one type of entity.

Examples:

- `pants`
- `wine`
- `travel-destination`
- `cake`
- `chair`

A category should define:

- display metadata;
- semantic attributes/sliders;
- default weights;
- supported hard constraints;
- optional action types;
- optional category-specific ranking configuration.

### Attribute definition

A semantic dimension, usually continuous.

Examples:

```text
square        0..100
experimental  0..100
bold          0..100
adrenaline    0..100
```

The same attribute key may be shared across categories when semantics genuinely match, but categories should not be forced into one global adjective set.

### Catalog entity / item

The canonical item stores normalized source metadata independently from the source adapter that produced it.

Typical fields:

```text
id
category_id
title
creator/brand/provider
canonical_source_url
source_id
source_external_id
image/media references
structured metadata
availability/price data where relevant
publication/review state
created_at / updated_at
```

Category-specific semantic attributes should remain extensible rather than becoming hundreds of nullable database columns.

### Source

Represents a configured ingestion origin.

Typical fields:

```text
id
name
adapter_type
base_url/provider
enabled
configuration reference
parser/adapter version
last_success_at
last_run_at
status
```

Secrets belong in server-side environment/secret storage, not in source records exposed to the browser.

### Ingestion run

Every import should create an observable run/job record.

Store at least:

```text
source_id
status
started_at
finished_at
imported_count
updated_count
skipped_count
duplicate_count
failed_count
error summary
adapter version
```

Detailed per-item errors may live in a related table/log stream.

### Analysis run

AI analysis must be versioned and reproducible enough to understand how an attribute set was produced.

Store fields such as:

```text
item_id
provider/model
schema_version
prompt/config_version
status
started_at
finished_at
structured_result
usage/cost metadata when available
error
```

Do not overwrite historical analysis blindly if version comparison or rollback may be useful.

## Separation of concerns

### Source adapters

A source adapter understands how to obtain records from one source family.

Its output should be a source-oriented raw structure, not final ranking data.

Adapters may include:

- manual JSON/CSV import;
- partner REST API;
- Shopify-like commerce source;
- generic public HTML source;
- wine provider;
- travel/location provider;
- creator upload.

Avoid a single large scraper full of source-specific conditionals.

### Normalizer

Converts source-specific raw data into the canonical catalog shape.

This is the boundary that prevents parsing concerns from leaking into the rest of the application.

### Deduplication

Runs before or around publication/analysis to avoid repeated items.

Initial signals may include:

- canonical URL;
- source external ID;
- normalized title/creator;
- image hash;
- later embedding similarity.

### Analysis pipeline

Turns canonical content/media into structured semantic attributes.

Important properties:

- asynchronous/background;
- server-side;
- versioned;
- retryable;
- category-schema driven;
- not required during interactive slider movement.

OpenAI integration belongs here, not inside the browser ranking loop.

### Ranking core

Consumes:

- category definition;
- user soft preferences;
- optional hard constraints;
- candidate items and attributes;
- optional future similarity/quality signals.

The ranking core must not know that an item is Pants, Wine, or Travel except through category configuration/strategies.

## Soft preferences vs hard constraints

This distinction is central to making the engine universal.

### Soft preferences

Examples:

```text
normal ↔ square
casual ↔ business
light ↔ bold
calm ↔ adrenaline
city ↔ nature
```

These affect rank by distance/closeness. They should usually not remove all imperfect matches.

### Hard constraints

Examples:

```text
price <= 600 EUR
trip duration 3..5 days
travel time <= 4 hours
availability = true
month = October
```

These may exclude candidates because violating them makes the result unusable.

A category defines which fields are constraints and which are semantic preferences.

## Ranking model

Initial semantic score:

```text
attribute_distance =
  sum(weight_i * normalized_abs_difference_i)
  / sum(active_weight_i)

semantic_score = 1 - attribute_distance
```

A future hybrid score may look like:

```text
final_score =
  semantic_score * semantic_weight
  + embedding_score * embedding_weight
  + quality_score * quality_weight
  + diversity_adjustment
```

Hard constraints are evaluated outside that weighted preference score.

Missing attributes should reduce confidence or omit that dimension rather than automatically forcing the item to zero relevance.

## Ranking Lab architecture

`/admin/ranking` should call the same ranking implementation used by the public experience.

It should expose enough diagnostics to answer:

- which constraints passed/failed?
- what was the distance for each active semantic attribute?
- which category weights were used?
- how much did optional similarity/quality signals contribute?
- which attributes are missing?

The purpose is to make ranking tunable without editing code blindly.

## Admin architecture

The admin panel should be part of the same product/repository initially.

Suggested areas:

```text
/admin
/admin/categories
/admin/attributes
/admin/items
/admin/sources
/admin/ingestion
/admin/analysis
/admin/duplicates
/admin/errors
/admin/ranking
```

Admin routes are rendered on demand and guarded by Astro middleware. Supabase SSR stores the session in cookies, and every admin response is marked private/no-store. The middleware validates the user server-side and requires `user.app_metadata.role === 'admin'`; `user_metadata` is never trusted for authorization.

The same immutable app-metadata claim is checked by Postgres RLS. Anonymous and ordinary authenticated users can select only published catalog rows. The admin claim can manage platform tables, although the current UI remains read-only until explicit write actions are added.

`SUPABASE_SECRET_KEY` is not used for browser or user-session access. It is consumed only by explicit maintenance scripts such as the Pants seed import. Authenticated admin application writes should use the user's cookie-bound client and RLS wherever practical.

## Background work

Normal web requests should not synchronously perform large crawls or expensive AI batches.

Use a job abstraction from the beginning even if the first implementation is simple.

A job should be able to represent:

```text
ingest source
normalize batch
analyze item/batch
re-analyze item/batch
deduplicate batch
```

If workload later exceeds the practical limits of the primary web host, workers can move to a dedicated execution service without changing the source/normalizer/analysis contracts.

## Storage and media

Do not assume every external image must immediately be rehosted.

The item model should distinguish:

- canonical remote media URL;
- cached preview if created;
- uploaded/licensed media;
- source display policy.

Creator uploads or internal assets may use managed object storage. Third-party media treatment remains source-specific.

## Why Astro + Vue still fits

The product is primarily catalog/content discovery with highly interactive islands.

Astro remains useful for:

- public/category pages;
- server-rendered or static content;
- route organization.

Vue remains useful for:

- slider interactions;
- dynamic results;
- Ranking Lab;
- admin interfaces.

If the server/API needs grow, add backend capabilities without rewriting the ranking/domain model around a different frontend framework.

## Architecture rule for new categories

Adding Wine or Travel should primarily require:

1. category definition;
2. attribute definitions;
3. hard-constraint schema if needed;
4. source adapter(s);
5. AI analysis schema/config;
6. source data.

It should **not** require copying `VisualExplorer`, creating `wineRanking.ts` and `travelRanking.ts`, or building separate applications.
