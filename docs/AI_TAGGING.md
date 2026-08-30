# AI tagging pipeline

AI tagging is an **indexing task**, not part of the real-time slider interaction. The first implementation runs synchronously for one administrator-submitted URL; queue/worker execution remains the intended path for batch volume.

## Current single-item workflow

`/admin/analyze` accepts a public URL and category. The server extracts bounded page metadata, then calls the OpenAI Responses API with the category definition, every enabled attribute's low/high labels, extracted text, and an optional public image URL. Strict structured output must contain exactly one normalized `0..100` value, confidence, and reason for each enabled attribute.

The run is written before fetching so metadata and model failures are observable. Results retain provider/model, schema/prompt versions, raw diagnostics, token usage, runtime, attempts, and error state. A successful run opens the shared item form and defaults to `review`; it is never published automatically. Administrator corrections are linked back to the analysis run.

Current versions:

- schema: `semantic-attributes-v1`;
- prompt: `url-metadata-vision-v1`;
- default model: `gpt-5.6` (overridable with `OPENAI_ANALYSIS_MODEL`).

## Desired pipeline

1. Fetch/receive an item and its metadata.
2. Normalize source/creator/title/URL.
3. Analyze one or more images.
4. Classify broad category.
5. Estimate category-specific continuous attributes (0..100).
6. Extract explicit properties where useful: dominant colors, object count, typography presence, etc.
7. Produce an embedding for later “more like this”.
8. Store analysis model/version for future re-processing.

Embeddings and automatic category classification are still future work; the administrator currently selects the category explicitly.

## Important distinction

Some properties should be factual/extracted:

- number of visible photos;
- dominant colors;
- presence of text;
- orientation;
- likely object category.

Other properties are semantic estimates:

- minimalism;
- experimentalness;
- business/formality;
- roundness/squareness;
- visual density.

Semantic scores do not need to be philosophically perfect. They need to be consistent enough that slider movement produces coherent neighborhoods.

## Bootstrapping

For the first few hundred items:

- AI proposes scores;
- humans inspect outliers;
- adjust prompts/rubrics;
- re-run the batch.

Do not manually label thousands of items before validating that users want the interaction.
