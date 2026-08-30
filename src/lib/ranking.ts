import type {
  AttributeDefinition,
  CatalogItem,
  ExplainedRankedItem,
  Preferences,
  RankedItem,
  ScoreExplanation,
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
  return explainItemScore(item, preferences, definitions).score;
}

/** Returns the same score as scoreItem plus the components used by Ranking Lab. */
export function explainItemScore(
  item: CatalogItem,
  preferences: Preferences,
  definitions: AttributeDefinition[],
): ScoreExplanation {
  let weightedDistance = 0;
  let totalWeight = 0;

  const components = definitions.map((definition) => {
    const itemValue = item.attributes[definition.key];
    const preference = preferences[definition.key];
    const weight = definition.weight ?? 1;

    if (typeof itemValue !== 'number' || typeof preference !== 'number') {
      return {
        key: definition.key,
        label: definition.label,
        preference: clamp(preference ?? definition.defaultValue),
        weight,
        missing: true,
      };
    }

    const distance = Math.abs(clamp(itemValue) - clamp(preference));
    const componentWeightedDistance = distance * weight;
    weightedDistance += componentWeightedDistance;
    totalWeight += weight;

    return {
      key: definition.key,
      label: definition.label,
      preference: clamp(preference),
      itemValue: clamp(itemValue),
      weight,
      distance,
      weightedDistance: componentWeightedDistance,
      missing: false,
    };
  });

  if (totalWeight === 0) {
    return {
      score: 0.5,
      totalWeight,
      components,
      missingAttributes: components
        .filter((component) => component.missing)
        .map((component) => component.key),
    };
  }

  const averageDistance = weightedDistance / totalWeight;
  const scoredComponents = components.map((component) =>
    component.missing
      ? component
      : {
          ...component,
          scoreContribution:
            (component.weight / totalWeight) * (1 - (component.distance ?? 0) / 100),
        },
  );
  return {
    score: Math.max(0, 1 - averageDistance / 100),
    averageDistance,
    totalWeight,
    components: scoredComponents,
    missingAttributes: scoredComponents
      .filter((component) => component.missing)
      .map((component) => component.key),
  };
}

export function rankItemsWithExplanation(
  items: CatalogItem[],
  preferences: Preferences,
  definitions: AttributeDefinition[],
): ExplainedRankedItem[] {
  return items
    .map((item) => {
      const explanation = explainItemScore(item, preferences, definitions);
      return { item, score: explanation.score, explanation };
    })
    .sort((a, b) => b.score - a.score);
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
