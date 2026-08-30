# AI tagging pipeline

AI tagging is an **offline indexing task**, not part of the real-time slider interaction.

## Desired pipeline

1. Fetch/receive an item and its metadata.
2. Normalize source/creator/title/URL.
3. Analyze one or more images.
4. Classify broad category.
5. Estimate category-specific continuous attributes (0..100).
6. Extract explicit properties where useful: dominant colors, object count, typography presence, etc.
7. Produce an embedding for later “more like this”.
8. Store analysis model/version for future re-processing.

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
