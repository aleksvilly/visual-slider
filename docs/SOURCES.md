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

## Manual admin adapter

The first implemented source adapter is a controlled one-item Manual Import. It accepts metadata supplied by an authenticated administrator, preserves the canonical URL, writes category-defined semantic values, and records its run/error state. It does not request or parse the submitted URL, so it is not an external scraper. All manual items share the `manual-admin` source record while retaining their own source site and canonical attribution.

## URL-assisted metadata fetch

Analyze URL is a controlled, server-side, single-page metadata helper rather than a crawler. It accepts only public HTTP/HTTPS pages, revalidates redirects, pins validated DNS, rejects local/private/reserved addresses and credentials, uses an eight-second/1.5 MB bound, and accepts HTML only. It sends no user cookies or authentication and does not bypass access controls, CAPTCHAs, paywalls, or anti-bot responses.

Extracted canonical URL, title/Open Graph title, image metadata, source site/domain, creator, and clear JSON-LD/Open Graph price data are retained with raw extraction diagnostics. A fetch or AI result is not permission to reproduce media and never publishes an item without administrator review.

## Production note

Attribution or a source link alone does not automatically grant the right to reproduce arbitrary copyrighted images. Before web-scale ingestion, define source-specific collection/display rules, robots/terms handling, caching behavior, takedown/claim flow, and partner/creator options.

This document is a product/engineering note, not legal advice.
