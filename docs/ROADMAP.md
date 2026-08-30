# Roadmap

## Phase 0 — interaction prototype

- [x] Astro + Vue architecture
- [x] generic category model
- [x] generic soft ranking
- [x] Pants demo route
- [x] Explore this
- [x] LocalStorage moodboard
- [x] source attribution links
- [x] GitHub Pages deployment for the prototype
- [ ] replace most placeholder seed imagery with curated real references
- [ ] manually test slider coherence and ranking behavior

The purpose of Phase 0 was to prove the basic slider-driven interaction, not to define the final architecture.

## Phase 1 — platform foundation

The next phase moves Visual Slider from static seed data to an operable catalog platform while keeping the existing `/pants` experience working.

### Database

- introduce Postgres as the source of truth;
- initial managed direction: Supabase/Postgres;
- define tables/entities for categories, attributes, items, item attributes, sources, ingestion runs, analysis runs, and admin metadata;
- preserve extensible category-specific attributes instead of creating a global column for every adjective;
- support canonical source URLs and source identity from day one.

### Admin panel

Create `/admin` with at least:

- Dashboard
- Categories
- Attributes
- Items
- Sources
- Ingestion runs
- AI analysis runs
- Errors
- Duplicate/review queue
- Ranking Lab

The admin UI should answer practical questions without requiring direct database access or reading deployment logs:

- what sources are connected?
- are they enabled?
- when did they last run?
- how many items were imported, skipped, duplicated, or failed?
- which AI schema/model analyzed an item?
- what attributes were produced?
- why is an item ranked where it is?

### Deployment

- keep GitHub-based deployments reproducible;
- move the full application/API to Vercel when server functionality is introduced;
- keep provider-specific infrastructure isolated from core ranking/domain code;
- keep the static GitHub Pages deployment only as long as it remains useful for the prototype/demo.

## Phase 2 — ingestion + AI analysis

Build ingestion as small source adapters, not one universal scraper.

Shared pipeline:

```text
source
  → adapter
  → raw item
  → normalizer
  → canonical item
  → deduplication
  → AI analysis
  → review/publish
```

### Source adapter foundation

- define adapter interface/contract;
- add source enable/disable state;
- add source/parser version;
- store last run and run status;
- store counts for imported / updated / skipped / duplicate / failed;
- expose `Run now` from admin;
- log errors with enough context for debugging;
- support manual/CSV/JSON import as a low-risk first adapter;
- then add one real external source adapter.

Potential adapter families later:

- commerce / Shopify-like sources;
- partner feeds/APIs;
- generic public HTML pages;
- creator uploads;
- wine datasets/APIs;
- travel/location APIs.

### AI analysis

- server-side OpenAI integration;
- structured category-specific analysis schema;
- image + text metadata analysis where appropriate;
- version prompt/schema/model configuration;
- async job state and retries;
- store structured attributes in the canonical catalog;
- allow admin re-analysis of an item or batch;
- track approximate usage/cost metadata where practical.

AI analysis should happen at ingestion/re-analysis time, not on every slider movement.

## Phase 3 — real Pants catalog + Ranking Lab

Use Pants as the first category on the real platform.

- migrate the current seed contract to database-backed items;
- collect approximately 300–1,000 useful references over time;
- normalize source metadata;
- run batch AI scoring;
- deduplicate near-identical references;
- preserve source/buy links;
- make missing attributes degrade gracefully;
- add analytics events for slider / explore / save / source interactions.

### Ranking Lab

Admin must be able to:

- choose a category;
- set the same sliders as a user;
- apply hard constraints where relevant;
- inspect ranked results;
- see per-item score components;
- compare ranking versions/weights;
- manually inspect or correct suspicious attributes.

The public ranking engine and Ranking Lab must share the same underlying scoring implementation.

## Phase 4 — prove the universal engine

Add categories that are intentionally different from Pants.

### Wine

Possible soft dimensions:

- light ↔ bold
- smooth ↔ tannic
- dry ↔ sweet
- soft ↔ acidic
- classic ↔ unusual
- fruity ↔ earthy
- easy ↔ complex
- everyday ↔ special

Possible structured fields/constraints:

- price
- region
- grape
- vintage
- availability

Wine is useful because it tests semantic sliders on a product whose experience is partly sensory rather than purely visual.

### Travel / locations / experiences

Possible soft dimensions:

- calm ↔ adrenaline
- city ↔ nature
- popular ↔ hidden
- comfort ↔ rough
- slow ↔ intense
- beach ↔ mountains
- quiet ↔ nightlife

Possible hard constraints:

- origin
- budget
- travel dates/month
- trip duration
- maximum flight/travel time
- availability

Travel is a key architectural test because it requires mixing continuous soft ranking with real hard constraints.

### Success condition

Pants, Wine, and Travel should use the same platform primitives:

- categories;
- attributes;
- sources;
- canonical items/entities;
- ingestion/analysis jobs;
- admin tooling;
- ranking API/core.

They may have different schemas and source adapters, but should not require separate ranking applications.

## Phase 5 — embeddings, quality, and scale

Only after the attribute-based system is useful:

- image/text embeddings;
- `More like this` similarity;
- hybrid ranking using attributes + embeddings;
- quality/source confidence signals;
- diversity reranking to avoid near-identical result pages;
- scalable background worker strategy if ingestion exceeds normal web-job limits;
- incremental re-indexing;
- larger duplicate detection pipeline.

Do not introduce a vector database before there is a concrete need that Postgres plus the current approach cannot satisfy cleanly.

## Phase 6 — creator/partner layer

- creator submissions;
- claim an existing indexed work;
- creator profiles/source attribution;
- source-specific display permissions;
- licensed download/customization actions;
- partner buy links;
- partner data feeds.

## Phase 7 — maker / action workflows

Potential actions after discovery:

- export moodboard/spec summary;
- share a collection;
- request a quote;
- send references to atelier/print shop/bakery/maker;
- attach dimensions/budget/preferences.

Production-ready CAD/tech packs are a separate product problem and are not required for Visual Slider to succeed as a discovery platform.

## Explicit non-goals for the current phases

- turning the default experience into image generation;
- payments/marketplace before discovery quality is proven;
- indiscriminate crawling of the entire web;
- bypassing authentication, paywalls, CAPTCHAs, or technical anti-bot controls;
- category-specific forks of the ranking engine;
- infrastructure complexity without an immediate product need.
