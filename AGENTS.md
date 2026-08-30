# AGENTS.md

Instructions for coding agents working on Visual Slider.

## Product contract

Visual Slider is a **discovery and ranking platform**. Its core experience is not prompt-first generation and not a traditional faceted-filter catalog.

The product loop is:

1. Existing items, places, products, references, or other discoverable entities are ingested from configured sources.
2. Data is normalized into a shared catalog model.
3. Offline analysis produces structured semantic attributes and, where useful, embeddings.
4. Users express intent through intuitive sliders plus optional hard constraints.
5. Results are continuously re-ranked by closeness.
6. Users can open the original source, save references, build a moodboard/list, or use a category-specific action.

Examples:

- Pants: normal ↔ square, slim ↔ huge, casual ↔ business.
- Wine: light ↔ bold, dry ↔ sweet, easy ↔ complex, classic ↔ unusual.
- Travel: calm ↔ adrenaline, city ↔ nature, popular ↔ hidden, plus hard limits such as budget, dates, duration, and travel time.

The shared engine must support very different categories without forking the application into separate products.

## Current development phase

The static `/pants` MVP proved the basic interaction can be implemented. The project may now add the platform foundation needed for real catalogs:

- Postgres-backed data model;
- admin panel;
- categories and attribute management;
- catalog/source management;
- source adapters and controlled ingestion;
- ingestion jobs and logs;
- offline AI analysis;
- analysis versioning and re-analysis;
- ranking inspection/debugging;
- support for multiple categories.

Do not preserve old MVP restrictions that forbid database, admin, or ingestion work. Those are now in scope.

## Technical principles

- Keep the catalog/category model generic.
- Category-specific behavior belongs in configuration/data and small strategy modules, not duplicated applications.
- Never hard-code the ranking engine around Pants, Wine, Travel, or any other category.
- Normalize continuous semantic attributes to a consistent range such as `0..100`.
- Separate **soft preferences** from **hard constraints**.
- Soft sliders should rank by closeness rather than eliminate most results.
- Hard constraints are appropriate for genuinely bounded fields such as price ceiling, dates, availability, duration, or maximum travel time.
- Missing attributes must degrade gracefully.
- Preserve source attribution, canonical source URL, and source identity as first-class data.
- Keep domain/ranking logic pure and testable where possible.
- OpenAI or other AI calls belong in server-side/background analysis, not in the slider interaction loop.
- Never expose API keys in client code.
- Prefer a shared normalizer after source adapters so source-specific parsing does not leak into the catalog model.
- Build observability into ingestion from the beginning: status, counts, failures, last run, parser version, and logs.

## Working infrastructure direction

Current working direction:

- Astro + Vue for the web experience;
- Vercel as the primary web/API deployment target;
- Postgres as the source of truth;
- Supabase is the preferred initial managed Postgres/Auth/Storage option unless implementation constraints justify another provider;
- long-running or high-volume ingestion must be isolated from normal request/response handlers and may later move to dedicated workers.

Keep provider-specific code behind small adapters where practical so core catalog and ranking logic are not tied to one host.

## Admin panel is a product requirement

The admin area is not an afterthought. It should make the system understandable and operable without reading server logs.

Minimum administrative domains:

- Dashboard
- Categories
- Attributes / slider definitions
- Items
- Sources
- Ingestion runs/jobs
- AI analysis runs
- Errors
- Duplicates / review queue
- Ranking Lab

### Ranking Lab

Ranking Lab should let an administrator select a category, set sliders/constraints, inspect the ordered results, and understand why an item received its score.

Prefer exposing score components such as:

- semantic attribute distance;
- embedding similarity when enabled;
- hard-constraint pass/fail;
- category weights;
- missing-data penalties;
- later quality/diversity bonuses.

Do not make ranking behavior a black box if a simple explanation can be shown.

## Source adapters and ingestion

Do not build one giant scraper.

Use source adapters with a shared contract, for example:

```text
source adapter
  → raw source item
  → normalizer
  → canonical item
  → deduplication
  → AI analysis
  → review/publish
```

Potential adapter families may include:

- structured partner/API feeds;
- Shopify-like commerce sources;
- generic public HTML sources;
- creator uploads;
- wine data sources;
- travel/location APIs;
- manually curated imports.

Do not bypass authentication, paywalls, CAPTCHAs, or technical anti-bot protections. Source display/rehosting policy remains source-specific; preserving a link does not automatically grant rights to republish third-party media.

See `docs/SOURCES.md`.

## AI analysis

AI analysis should be reproducible and versioned.

Store enough metadata to know:

- model/provider;
- analysis schema version;
- prompt/config version;
- run/job ID;
- timestamp;
- raw or normalized result where appropriate;
- failure/retry state.

Prefer structured output that maps directly into category attributes. Re-analysis must not require rewriting source adapters.

## Ranking

The initial semantic ranker is deliberately simple: weighted normalized distance over defined slider attributes.

As the platform grows, ranking may blend multiple signals, for example:

```text
final score =
  semantic attribute score
  + optional embedding similarity
  + category-specific quality/availability signals
  + diversity adjustment
```

Hard constraints are evaluated separately from soft preference scoring.

Do not add complex ML ranking merely because infrastructure exists. Add complexity only when it improves real discovery quality.

See `docs/SLIDER_RANKING.md`.

## Category expansion

`Fashion → Pants` remains the first implementation reference, not the product boundary.

Useful validation categories include:

- fashion / bags / shoes / eyewear;
- furniture / lamps / mirrors / rugs;
- posters / booklets / packaging;
- cakes / bouquets;
- hair / nails / tattoos;
- interiors;
- wine;
- travel destinations / experiences / locations.

A new category should mostly require category schema/configuration, source data, and possibly a small constraint strategy. It should not require copying the explorer or ranking engine.

## Definition of done for the next platform phase

- Existing `/pants` prototype remains functional.
- A database-backed catalog can serve the same explorer contract as the current seed data.
- Categories and attributes can be inspected and edited from admin.
- Sources can be enabled/disabled and their ingestion status is visible.
- At least one source adapter can import items through the shared normalization pipeline.
- AI analysis can run asynchronously and store versioned structured attributes.
- Ranking Lab can reproduce a user query and show score components.
- No secret/API key is shipped to the browser.
- Deployment remains reproducible from GitHub.

## Still out of scope unless explicitly requested

- AI generation as the default discovery experience;
- production-ready sewing/CAD/manufacturing files;
- payments;
- full creator marketplace;
- automated licensing contracts;
- maker quote/dispatch workflow;
- indiscriminate crawling of the entire web;
- infrastructure complexity without a concrete current use case.

When architecture decisions change, update the relevant docs in the same work rather than leaving Codex or future agents with contradictory instructions.
