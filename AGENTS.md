# AGENTS.md

Instructions for coding agents working on Visual Slider.

## Product contract

Visual Slider is primarily a **discovery and ranking product**, not an image generator.

The core loop is:

1. Existing visual items are indexed.
2. Offline analysis produces numerical semantic attributes + later embeddings.
3. Users express visual intent through intuitive sliders.
4. Results are softly re-ranked by closeness.
5. Users can open the original source, save references, and later export/share a moodboard.

Do not accidentally turn the MVP into a prompt-first generator or a traditional faceted-filter ecommerce site.

## Current validation question

Can semantic sliders feel more natural and useful than text search for visual discovery?

Everything in MVP 0.1 should support answering that question.

## Technical principles

- Keep the catalog/category model generic.
- Category-specific behavior belongs in data definitions, not duplicated UI.
- Sliders are preferences, not hard filters.
- Missing attributes should degrade gracefully.
- Preserve source attribution and source URLs.
- Keep the front end usable without a backend during MVP validation.
- Avoid premature infrastructure: auth, payments, marketplace logic, vector DBs, queues, and production ingestion are future work.

## First category

`Fashion → Pants` is the first validation category only. Do not hard-code the ranking engine around pants semantics.

Future categories may include:

- bags / backpacks
- furniture / mirrors / rugs / lamps
- posters / booklets / packaging
- cakes / bouquets
- hair / nails / tattoos
- interiors
- jewelry / glasses

Each category can define its own slider attributes while sharing the same engine.

## Data policy during prototype phase

Seed data may contain external references for interface testing, but:

- always preserve the original source URL and source site;
- never present external work as owned by Visual Slider;
- distinguish demo/synthetic items from real indexed references;
- production ingestion and display rights need source-specific rules later.

See `docs/SOURCES.md`.

## Ranking

The initial ranker is deliberately simple: weighted normalized absolute distance over defined slider attributes.

Do not add complex ML ranking until we have interaction data proving it is necessary.

See `docs/SLIDER_RANKING.md`.

## Definition of done for MVP 0.1

- `/pants` loads without a backend.
- All sliders visibly change result order.
- `Explore this` sets slider values from an item's attributes.
- Save/remove moodboard state survives refresh via LocalStorage.
- Every external reference exposes its original source.
- Mobile layout remains usable.

## Out of scope for now

- AI generation of new designs
- production-ready sewing/CAD files
- automatic crawling of the entire web
- login/accounts
- payments
- creator marketplace
- automated licensing
- production partner dispatch
- maker quote system

Document proposals for these instead of implementing them unless the project owner explicitly changes scope.
