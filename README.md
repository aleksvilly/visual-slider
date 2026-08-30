# Visual Slider

Visual Slider is a **visual discovery engine** for existing products, designs, references, and creative work.

Instead of describing an idea with specialist vocabulary, a user moves intuitive semantic sliders such as **normal ↔ square**, **minimal ↔ maximal**, **casual ↔ business**, or **soft ↔ structured**. The catalog is continuously re-ranked so the closest existing references move to the top.

The core product does **not** depend on image generation. AI is mainly used offline to analyze and tag catalog items. Results can link back to stores, designers, source projects, or be saved into a moodboard that can later be handed to an atelier, print shop, bakery, maker, etc.

## MVP

The first demo category is **Fashion → Pants**.

Core interactions:

1. Browse an image-first catalog.
2. Adjust semantic sliders.
3. Re-rank results instead of hiding them with hard filters.
4. Click **Explore this** to move the sliders toward an item's attributes.
5. Save references into a local moodboard.
6. Follow the original source.

The domain model is generic so later categories can include bags, furniture, posters, cakes, flowers, interiors, hair, tattoos, packaging, and others without rebuilding the ranking engine.

## Stack

- Astro 7 server output
- Vue 3 islands
- TypeScript
- Supabase Postgres 17 and Supabase Auth
- Provider-neutral server-side semantic analysis through OpenRouter and OpenAI
- Provider-neutral server repository with a static seed fallback
- Vercel server adapter
- Protected Supabase-backed admin writes and Ranking Lab
- LocalStorage for the first moodboard implementation

`/pants` uses published Postgres catalog data when the required Supabase variables are present. With no Supabase configuration it uses the checked-in seed repository, keeping local development usable. The application is now built for Vercel server deployment; the former GitHub Pages deployment workflow has been replaced by a GitHub verification workflow.

## Run locally

```bash
nvm use
npm install
npm run dev
```

Then open the URL printed by Astro, normally `http://localhost:4321`.

Without a local `.env`, `/pants` uses seed data and `/admin` redirects to a configuration-aware login page.

## Supabase setup

The existing project is fixed to:

- project ref: `yzayxussrpreiyknlnhi`;
- URL: `https://yzayxussrpreiyknlnhi.supabase.co`;
- region: `eu-west-1`;
- database: PostgreSQL 17.

Do not create another project. Copy `.env.example` to `.env` and fill in keys from this project only. The application refuses to connect when the ref and URL do not match.

Runtime variables:

```text
SUPABASE_PROJECT_REF
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
OPENROUTER_API_KEY
OPENROUTER_ANALYSIS_MODEL
OPENAI_API_KEY
OPENAI_ANALYSIS_MODEL
```

Analyze URL attempts OpenRouter first and OpenAI second. `OPENROUTER_ANALYSIS_MODEL` defaults to `openrouter/free`; `OPENAI_ANALYSIS_MODEL` defaults to `gpt-5.6`. Provider keys and model configuration are server-only. `SUPABASE_SECRET_KEY` is privileged and optional for the current Vercel runtime; it is required only by the explicit Pants import command. Never prefix any secret with `PUBLIC_`, commit it, or expose it in browser code.

### Migration

The ordered source-of-truth migrations are:

```text
supabase/migrations/202608300001_phase_1_foundation.sql
supabase/migrations/202608300002_url_analysis.sql
```

Validate it locally without contacting Supabase:

```bash
npm run validate:migration
```

They are tested together against an in-memory PostgreSQL 17 runtime, including anonymous denial, administrator create/edit/archive/delete, pre-item analysis-run writes, ingestion-run writes, and published-catalog visibility. The second migration is required for URL-assisted analysis and must be applied after the deployed foundation migration. Repository migrations remain the source of truth; this implementation does not apply remote database changes.

When you are ready to apply it, explicitly link the CLI to the existing project, confirm the ref, dry-run, and then push:

```bash
npx supabase link --project-ref yzayxussrpreiyknlnhi
npx supabase db push --dry-run
npx supabase db push
```

Do not use `db reset --linked` on this project.

After the migration has been applied, import the current Pants fixture idempotently:

```bash
npm run seed:pants
```

The import requires all four variables from `.env.example`, records an ingestion run, and refuses to target a different project.

### Admin authentication

Manual Supabase Auth setup is required once:

1. Confirm the Email provider is enabled in Supabase Auth.
2. Create or invite the one administrator user.
3. Set that user's immutable app metadata to `{ "role": "admin" }` using the Dashboard/Admin API, or run this in the project's SQL editor after replacing the email:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"role":"admin"}'::jsonb
where email = 'admin@example.com';
```

The user must sign in again after a role change so a fresh JWT contains the claim. Do not put authorization data in `user_metadata`, which users can edit themselves.

## Routes

- `/` — product explanation and categories
- `/pants` — first working visual-slider prototype
- `/admin/login` — server-rendered Supabase Auth sign-in
- `/admin` — protected database-backed operational dashboard
- `/admin/items` — real catalog list with manual import, edit, archive, and delete workflows
- `/admin/items/new` — generic category-driven Manual Import
- `/admin/analyze` — SSRF-protected public-page metadata fetch plus synchronous provider fallback
- `/admin/sources`, `/admin/ingestion`, `/admin/errors` — real source and import observability
- `/admin/categories`, `/admin/attributes` — current category-definition inspection
- `/admin/analysis` — versioned AI diagnostics, review, and failure retry
- `/admin/duplicates` — explicit future-work empty state
- `/admin/ranking` — category-selectable database Ranking Lab with score contributions

## Project structure

```text
src/
  components/       Vue interaction layer
  data/             demo catalog + category definitions
  layouts/          Astro layouts
  lib/              ranking, domain types, repository boundary, admin read model
  pages/            routes
  styles/           global UI styles

supabase/
  migrations/       versioned Postgres schema

scripts/
  validate-migration.ts
  seed-pants.ts

docs/
  PRODUCT.md
  MVP.md
  ARCHITECTURE.md
  DATA_MODEL.md
  SLIDER_RANKING.md
  AI_TAGGING.md
  SOURCES.md
  ROADMAP.md

AGENTS.md            instructions for future coding agents
```

## Product principle

> **Search by feeling, not vocabulary.**

Slider values are preferences, not strict constraints. The engine should nearly always return something useful and order results by closeness.

## Current status

Phase 1 includes the deployed Postgres 17 foundation, a server-side Supabase repository, seed fallback, Vercel server output, protected admin routes, and authenticated catalog writes. Manual Import is a small generic adapter: it upserts a shared manual source, records an ingestion run, creates or updates one canonical item, and writes the selected category's semantic values. Failed validation or persistence is retained in ingestion diagnostics.

The first Phase 2 AI slice adds one controlled URL-assisted path. An authenticated admin selects any configured category and submits one public URL. The server validates and fetches bounded public HTML metadata once, then tries category-driven provider adapters in the fixed order OpenRouter → OpenAI. Each attempt records requested/actual model, status, runtime, usage, and error. No item is created or published until the admin explicitly saves the review.

Fallback is limited to rate/quota errors, timeout, provider 5xx/unavailability, and invalid/incomplete structured output. URL, SSRF, metadata-access, category, authentication, and other request errors do not move to another provider. All admin forms post to Astro SSR and use the signed-in user's Supabase cookie session, so normal RLS and the `app_metadata.role = admin` policy authorize every write. Provider API keys and Supabase privileged credentials are never used in browser code. Bulk crawling, background queues, embeddings, and automatic publication remain unimplemented.
