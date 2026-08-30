import { categories } from '../../data/categories';
import { pantsItems } from '../../data/pants';
import type { CatalogItem } from '../types';
import type { CatalogRepository } from './repository';

const itemsByCategory: Record<string, CatalogItem[]> = {
  pants: pantsItems,
};

export const seedCatalogRepository: CatalogRepository = {
  async getExplorerCatalog(categoryId) {
    const category = categories.find((candidate) => candidate.id === categoryId);

    if (!category) return null;

    return {
      category,
      items: itemsByCategory[categoryId] ?? [],
      origin: 'seed',
    };
  },
};

