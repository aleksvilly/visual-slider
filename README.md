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

- Astro
- Vue 3 islands
- TypeScript
- Static seed catalog for the MVP
- LocalStorage for the first moodboard implementation

A database, ingestion workers, embeddings, and AI image analysis come after the browsing UX is validated.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL printed by Astro, normally `http://localhost:4321`.

## Routes

- `/` — product explanation and categories
- `/pants` — first working visual-slider prototype

## Project structure

```text
src/
  components/       Vue interaction layer
  data/             demo catalog + category definitions
  layouts/          Astro layouts
  lib/              ranking and domain types
  pages/            routes
  styles/           global UI styles

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

The repository contains a working front-end MVP architecture with a deliberately small demo dataset. Seed images are remote references/placeholder material and are not yet a production ingestion catalog.