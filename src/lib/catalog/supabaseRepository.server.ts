import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogItem, CategoryDefinition } from '../types';
import type { Database } from '../supabase/database.types';
import { createPublicDataClient } from '../supabase/serverClient.server';
import type { CatalogRepository } from './repository';

type PublicClient = SupabaseClient<Database>;

function required<T>(data: T | null, error: { message: string } | null, label: string): T {
  if (error) throw new Error(`Supabase ${label} query failed: ${error.message}`);
  if (data === null) throw new Error(`Supabase ${label} query returned no data.`);
  return data;
}

export class SupabaseCatalogRepository implements CatalogRepository {
  constructor(private readonly client: PublicClient) {}

  async getExplorerCatalog(categoryId: string) {
    const categoryResult = await this.client
      .from('categories')
      .select('id, slug, name, eyebrow, description')
      .eq('slug', categoryId)
      .eq('status', 'published')
      .maybeSingle();

    if (categoryResult.error) {
      throw new Error(`Supabase category query failed: ${categoryResult.error.message}`);
    }
    if (!categoryResult.data) return null;

    const categoryRow = categoryResult.data;
    const [attributeResult, itemResult] = await Promise.all([
      this.client
        .from('attribute_definitions')
        .select('id, key, label, low_label, high_label, default_value, weight, sort_order')
        .eq('category_id', categoryRow.id)
        .eq('enabled', true)
        .order('sort_order'),
      this.client
        .from('items')
        .select(
          'id, public_id, category_id, source_id, source_external_id, title, creator, source_site, canonical_source_url, image_url, price_label, buyable, note',
        )
        .eq('category_id', categoryRow.id)
        .eq('publication_status', 'published')
        .order('created_at'),
    ]);

    const attributeRows = required(attributeResult.data, attributeResult.error, 'attribute');
    const itemRows = required(itemResult.data, itemResult.error, 'item');
    const itemIds = itemRows.map((item) => item.id);
    const valueResult = itemIds.length
      ? await this.client
          .from('item_attribute_values')
          .select('item_id, attribute_id, value')
          .in('item_id', itemIds)
      : { data: [], error: null };
    const valueRows = required(valueResult.data, valueResult.error, 'item attribute value');

    const attributeKeyById = new Map(attributeRows.map((attribute) => [attribute.id, attribute.key]));
    const attributesByItem = new Map<string, Record<string, number>>();

    for (const value of valueRows) {
      const key = attributeKeyById.get(value.attribute_id);
      if (!key) continue;
      const itemAttributes = attributesByItem.get(value.item_id) ?? {};
      itemAttributes[key] = Number(value.value);
      attributesByItem.set(value.item_id, itemAttributes);
    }

    const category: CategoryDefinition = {
      id: categoryRow.slug,
      name: categoryRow.name,
      eyebrow: categoryRow.eyebrow,
      description: categoryRow.description,
      attributes: attributeRows.map((attribute) => ({
        key: attribute.key,
        label: attribute.label,
        lowLabel: attribute.low_label,
        highLabel: attribute.high_label,
        defaultValue: Number(attribute.default_value),
        weight: Number(attribute.weight),
      })),
    };

    const items: CatalogItem[] = itemRows.map((item) => ({
      id: item.public_id,
      categoryId: categoryRow.slug,
      sourceId: item.source_id ?? undefined,
      sourceExternalId: item.source_external_id ?? undefined,
      title: item.title,
      creator: item.creator ?? undefined,
      sourceSite: item.source_site,
      sourceUrl: item.canonical_source_url ?? undefined,
      imageUrl: item.image_url,
      priceLabel: item.price_label ?? undefined,
      buyable: item.buyable,
      note: item.note ?? undefined,
      attributes: attributesByItem.get(item.id) ?? {},
    }));

    return { category, items, origin: 'postgres' as const };
  }
}

export function createSupabaseCatalogRepository() {
  const client = createPublicDataClient();
  return client ? new SupabaseCatalogRepository(client) : null;
}
