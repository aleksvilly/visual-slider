# Slider ranking

## Principle

Slider values are desired coordinates, not hard filters.

If the user selects `square = 80`, an item with `square = 69` should not disappear. It should simply rank below a closer item.

## MVP score

For each active attribute:

```text
distance_i = abs(item_i - preference_i)
```

Apply a category-defined weight:

```text
weighted_distance = sum(distance_i × weight_i) / sum(weight_i)
```

Convert to similarity:

```text
score = 1 - weighted_distance / 100
```

The UI sorts descending by score.

`ranking.ts` also exposes the same calculation as a structured explanation. Ranking Lab uses real published database items and shows the user slider, raw item value, absolute distance, category weight, weighted distance, per-attribute score contribution, active total weight, and final score. Contributions sum to the total semantic score. This keeps diagnostics and public ordering from drifting into separate implementations.

## Missing attributes

Missing values are ignored rather than treated as zero. This allows imperfect early datasets to remain searchable.

## Explore this

When a user clicks an item, copy the item's known attribute values into the sliders. The user can then change a single dimension and effectively ask:

> “More like this, but more/less X.”

This interaction is strategically more important than the exact distance metric.

## Future ranking improvements

Only after usage data:

- per-slider user-adjustable importance;
- image/text embedding similarity;
- color distance;
- source diversity/re-ranking;
- deduplication;
- popularity or source quality priors;
- session learning from saves/clicks;
- nearest-neighbor exploration.

Do not introduce these before the simple metric has been tested with a sufficiently large catalog.
