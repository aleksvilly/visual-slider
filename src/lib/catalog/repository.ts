import type { CatalogItem, CategoryDefinition } from '../types';

export type CatalogOrigin = 'seed' | 'postgres';

export interface ExplorerCatalog {
  category: CategoryDefinition;
  items: CatalogItem[];
  origin: CatalogOrigin;
}

/**
 * Provider-neutral read boundary for the public explorer.
 *
 * The current implementation uses checked-in seed data. A server-side
 * Postgres implementation can replace it without changing VisualExplorer.
 */
export interface CatalogRepository {
  getExplorerCatalog(categoryId: string): Promise<ExplorerCatalog | null>;
}

