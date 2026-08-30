# Source model

Visual Slider should treat the web as **sources to index**, not content to pretend it owns.

## Potential source types

- ecommerce product pages;
- designer portfolios;
- creator submissions;
- public archives;
- partner feeds/APIs;
- permitted embeds;
- user uploads;
- internally created demo references.

## Source display modes (future)

A practical source-policy layer may expose modes such as:

- `LINK_ONLY`
- `EMBED`
- `PREVIEW`
- `LICENSED`
- `BUYABLE`

The same discovery engine can index all of them while changing what is displayed and what downstream actions are offered.

## Required metadata

Every externally sourced item should retain:

- original/canonical URL;
- source site;
- creator/brand when known;
- retrieval timestamp later;
- source-specific display policy later.

## Prototype rule

The current seed catalog is only for interface validation. Some entries are explicitly synthetic placeholders.

## Production note

Attribution or a source link alone does not automatically grant the right to reproduce arbitrary copyrighted images. Before web-scale ingestion, define source-specific collection/display rules, robots/terms handling, caching behavior, takedown/claim flow, and partner/creator options.

This document is a product/engineering note, not legal advice.
