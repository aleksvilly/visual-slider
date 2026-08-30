export type PublicationStatus = 'draft' | 'review' | 'published' | 'rejected' | 'archived';

export interface AdminAttribute {
  id: string;
  key: string;
  label: string;
  lowLabel: string;
  highLabel: string;
  defaultValue: number;
  weight: number;
  sortOrder: number;
  enabled: boolean;
}

export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  status: 'draft' | 'published' | 'archived';
  eyebrow: string;
  description: string;
  attributes: AdminAttribute[];
}

export interface AdminItemInput {
  categoryId: string;
  title: string;
  sourceUrl: string;
  imageUrl: string;
  creator: string | null;
  sourceSite: string;
  priceAmount: number | null;
  priceCurrency: string | null;
  priceLabel: string | null;
  publicationStatus: PublicationStatus;
  attributeValues: Record<string, number>;
}

export interface AdminItemSummary {
  id: string;
  publicId: string;
  title: string;
  categoryName: string;
  categorySlug: string;
  creator: string | null;
  sourceSite: string;
  sourceUrl: string | null;
  publicationStatus: PublicationStatus;
  attributeCount: number;
  attributeTotal: number;
  updatedAt: string;
}

export interface AdminItemDetail extends AdminItemSummary {
  categoryId: string;
  imageUrl: string;
  priceAmount: number | null;
  priceCurrency: string | null;
  priceLabel: string | null;
  attributes: Record<string, number>;
}

export interface AdminSource {
  id: string;
  slug: string;
  name: string;
  adapterType: string;
  adapterVersion: string;
  baseUrl: string | null;
  enabled: boolean;
  displayPolicy: string;
  status: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
}

export interface ManualImportResult {
  itemId: string;
  runId: string;
  created: boolean;
}

export interface AdminIngestionRun {
  id: string;
  sourceName: string;
  status: string;
  adapterVersion: string;
  startedAt: string | null;
  finishedAt: string | null;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  duplicateCount: number;
  failedCount: number;
  errorSummary: string | null;
}

export interface AdminIngestionError {
  id: string;
  runId: string;
  sourceExternalId: string | null;
  stage: string;
  code: string | null;
  message: string;
  createdAt: string;
}
