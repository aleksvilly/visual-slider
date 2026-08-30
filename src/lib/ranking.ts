import type {
  AttributeDefinition,
  CatalogItem,
  Preferences,
  RankedItem,
} from './types';

const clamp = (value: number) => Math.min(100, Math.max(0, value));

/**
 * Soft semantic ranking.
 *
 * A slider value is a preference, not a hard constraint. Missing attributes are
 * ignored instead of penalized. The result is a 0..1 similarity score.
 */
export function scoreItem(
  item: CatalogItem,
  preferences: Preferences,
  definitions: AttributeDefinition[],
): number {
  let weightedDistance = 0;
  let totalWeight = 0;

  for (const definition of definitions) {
    const itemValue = item.attributes[definition.key];
    const preference = preferences[definition.key];

    if (typeof itemValue !== 'number' || typeof preference !== 'number') {
      continue;
    }

    const weight = definition.weight ?? 1;
    weightedDistance += Math.abs(clamp(itemValue) - clamp(preference)) * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0.5;

  const averageDistance = weightedDistance / totalWeight;
  return Math.max(0, 1 - averageDistance / 100);
}

export function rankItems(
  items: CatalogItem[],
  preferences: Preferences,
  definitions: AttributeDefinition[],
): RankedItem[] {
  return items
    .map((item) => ({
      item,
      score: scoreItem(item, preferences, definitions),
    }))
    .sort((a, b) => b.score - a.score);
}

export function preferencesFromItem(
  item: CatalogItem,
  definitions: AttributeDefinition[],
): Preferences {
  return Object.fromEntries(
    definitions.map((definition) => [
      definition.key,
      item.attributes[definition.key] ?? definition.defaultValue,
    ]),
  );
}
