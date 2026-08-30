import type { AdminAnalysisRun, AdminCategory } from '../admin/types';
import type { ExtractedPageMetadata } from './types';

export function extractedMetadataFromRun(run: AdminAnalysisRun): ExtractedPageMetadata | null {
  if (!run.rawResult || typeof run.rawResult !== 'object' || Array.isArray(run.rawResult)) return null;
  const metadata = (run.rawResult as Record<string, unknown>).metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = metadata as Record<string, unknown>;
  if (typeof value.canonicalUrl !== 'string' || typeof value.title !== 'string') return null;
  return value as unknown as ExtractedPageMetadata;
}

export function analysisReviewInitial(run: AdminAnalysisRun, category: AdminCategory) {
  const metadata = extractedMetadataFromRun(run);
  if (!metadata || !run.structuredResult) throw new Error('This analysis has no reviewable result.');
  const valuesByKey = new Map(
    run.structuredResult.attributes.map((attribute) => [attribute.attribute_key, attribute.value]),
  );
  return {
    categoryId: category.id,
    title: run.structuredResult.detected_title || metadata.title,
    sourceUrl: metadata.canonicalUrl,
    imageUrl: metadata.imageUrl ?? '',
    creator: run.structuredResult.detected_creator || metadata.creator || '',
    sourceSite: metadata.siteName || metadata.domain,
    priceAmount: metadata.priceAmount,
    priceCurrency: metadata.priceCurrency ?? '',
    publicationStatus: 'review' as const,
    attributes: Object.fromEntries(
      category.attributes
        .filter((attribute) => attribute.enabled)
        .map((attribute) => [
          attribute.id,
          valuesByKey.get(attribute.key) ?? attribute.defaultValue,
        ]),
    ),
  };
}
