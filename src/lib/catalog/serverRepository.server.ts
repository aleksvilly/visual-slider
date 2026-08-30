import { seedCatalogRepository } from './seedRepository';
import { createSupabaseCatalogRepository } from './supabaseRepository.server';

/**
 * Selects Postgres only when all public Supabase variables are present and
 * explicitly point at the expected project. Missing configuration keeps the
 * checked-in catalog available for local development.
 */
export function getServerCatalogRepository() {
  return createSupabaseCatalogRepository() ?? seedCatalogRepository;
}

