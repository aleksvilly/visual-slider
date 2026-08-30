import { randomUUID } from 'node:crypto';
import type { APIContext } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExplorerCatalog } from '../catalog/repository';
import type { Database, Json } from '../supabase/database.types';
import { createSupabaseAuthClient } from '../supabase/serverClient.server';
import type {
  AdminCategory,
  AdminItemDetail,
  AdminItemInput,
  AdminItemSummary,
  AdminIngestionError,
  AdminIngestionRun,
  AdminSource,
  ManualImportResult,
} from './types';

type AdminClient = SupabaseClient<Database>;

const MANUAL_SOURCE_SLUG = 'manual-admin';
const MANUAL_ADAPTER_VERSION = '1.0.0';

function operationError(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown manual import failure';
}

function reviewStatus(publicationStatus: AdminItemInput['publicationStatus']) {
  return publicationStatus === 'published' ? 'approved' : 'unreviewed';
}

export class SupabaseAdminRepository {
  constructor(
    private readonly client: AdminClient,
    private readonly adminUserId: string,
  ) {}

  private async upsertManualSource(startedAt: string) {
    const sourceResult = await this.client
      .from('sources')
      .upsert(
        {
          slug: MANUAL_SOURCE_SLUG,
          name: 'Manual admin import',
          adapter_type: 'manual',
          enabled: true,
          display_policy: 'LINK_ONLY',
          adapter_version: MANUAL_ADAPTER_VERSION,
          configuration: { mode: 'authenticated-admin-form' },
          status: 'running',
          last_run_at: startedAt,
        },
        { onConflict: 'slug' },
      )
      .select('id')
      .single();
    operationError('Manual source upsert failed', sourceResult.error);
    return sourceResult.data!.id;
  }

  async listCategories(): Promise<AdminCategory[]> {
    const [categoryResult, attributeResult] = await Promise.all([
      this.client
        .from('categories')
        .select('id, slug, name, status, eyebrow, description')
        .order('name'),
      this.client
        .from('attribute_definitions')
        .select(
          'id, category_id, key, label, low_label, high_label, default_value, weight, sort_order, enabled',
        )
        .order('sort_order'),
    ]);
    operationError('Category query failed', categoryResult.error);
    operationError('Attribute query failed', attributeResult.error);

    return (categoryResult.data ?? []).map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      status: category.status,
      eyebrow: category.eyebrow,
      description: category.description,
      attributes: (attributeResult.data ?? [])
        .filter((attribute) => attribute.category_id === category.id)
        .map((attribute) => ({
          id: attribute.id,
          key: attribute.key,
          label: attribute.label,
          lowLabel: attribute.low_label,
          highLabel: attribute.high_label,
          defaultValue: Number(attribute.default_value),
          weight: Number(attribute.weight),
          sortOrder: attribute.sort_order,
          enabled: attribute.enabled,
        })),
    }));
  }

  async listItems(): Promise<AdminItemSummary[]> {
    const [itemResult, categories] = await Promise.all([
      this.client
        .from('items')
        .select(
          'id, public_id, category_id, title, creator, source_site, canonical_source_url, publication_status, updated_at',
        )
        .order('updated_at', { ascending: false }),
      this.listCategories(),
    ]);
    operationError('Item query failed', itemResult.error);
    const items = itemResult.data ?? [];
    const itemIds = items.map((item) => item.id);
    const valueResult = itemIds.length
      ? await this.client.from('item_attribute_values').select('item_id').in('item_id', itemIds)
      : { data: [], error: null };
    operationError('Item attribute coverage query failed', valueResult.error);

    const valueCounts = new Map<string, number>();
    for (const value of valueResult.data ?? []) {
      valueCounts.set(value.item_id, (valueCounts.get(value.item_id) ?? 0) + 1);
    }
    const categoryById = new Map(categories.map((category) => [category.id, category]));

    return items.map((item) => {
      const category = categoryById.get(item.category_id);
      return {
        id: item.id,
        publicId: item.public_id,
        title: item.title,
        categoryName: category?.name ?? 'Unknown category',
        categorySlug: category?.slug ?? 'unknown',
        creator: item.creator,
        sourceSite: item.source_site,
        sourceUrl: item.canonical_source_url,
        publicationStatus: item.publication_status,
        attributeCount: valueCounts.get(item.id) ?? 0,
        attributeTotal: category?.attributes.filter((attribute) => attribute.enabled).length ?? 0,
        updatedAt: item.updated_at,
      };
    });
  }

  async getItem(itemId: string): Promise<AdminItemDetail | null> {
    const itemResult = await this.client
      .from('items')
      .select(
        'id, public_id, category_id, title, creator, source_site, canonical_source_url, image_url, price_amount, price_currency, price_label, publication_status, updated_at',
      )
      .eq('id', itemId)
      .maybeSingle();
    operationError('Item query failed', itemResult.error);
    if (!itemResult.data) return null;

    const [categories, valuesResult] = await Promise.all([
      this.listCategories(),
      this.client
        .from('item_attribute_values')
        .select('attribute_id, value')
        .eq('item_id', itemId),
    ]);
    operationError('Item attribute query failed', valuesResult.error);
    const item = itemResult.data;
    const category = categories.find((candidate) => candidate.id === item.category_id);
    const attributes = Object.fromEntries(
      (valuesResult.data ?? []).map((value) => [value.attribute_id, Number(value.value)]),
    );

    return {
      id: item.id,
      publicId: item.public_id,
      categoryId: item.category_id,
      categoryName: category?.name ?? 'Unknown category',
      categorySlug: category?.slug ?? 'unknown',
      title: item.title,
      creator: item.creator,
      sourceSite: item.source_site,
      sourceUrl: item.canonical_source_url,
      imageUrl: item.image_url,
      priceAmount: item.price_amount === null ? null : Number(item.price_amount),
      priceCurrency: item.price_currency,
      priceLabel: item.price_label,
      publicationStatus: item.publication_status,
      attributeCount: Object.keys(attributes).length,
      attributeTotal: category?.attributes.filter((attribute) => attribute.enabled).length ?? 0,
      attributes,
      updatedAt: item.updated_at,
    };
  }

  async listSources(): Promise<AdminSource[]> {
    const result = await this.client
      .from('sources')
      .select(
        'id, slug, name, adapter_type, adapter_version, base_url, enabled, display_policy, status, last_run_at, last_success_at',
      )
      .order('name');
    operationError('Source query failed', result.error);
    return (result.data ?? []).map((source) => ({
      id: source.id,
      slug: source.slug,
      name: source.name,
      adapterType: source.adapter_type,
      adapterVersion: source.adapter_version,
      baseUrl: source.base_url,
      enabled: source.enabled,
      displayPolicy: source.display_policy,
      status: source.status,
      lastRunAt: source.last_run_at,
      lastSuccessAt: source.last_success_at,
    }));
  }

  async listIngestionRuns(): Promise<AdminIngestionRun[]> {
    const [runResult, sources] = await Promise.all([
      this.client
        .from('ingestion_runs')
        .select(
          'id, source_id, status, adapter_version, started_at, finished_at, imported_count, updated_count, skipped_count, duplicate_count, failed_count, error_summary',
        )
        .order('created_at', { ascending: false }),
      this.listSources(),
    ]);
    operationError('Ingestion run query failed', runResult.error);
    const sourceById = new Map(sources.map((source) => [source.id, source.name]));
    return (runResult.data ?? []).map((run) => ({
      id: run.id,
      sourceName: sourceById.get(run.source_id) ?? 'Unknown source',
      status: run.status,
      adapterVersion: run.adapter_version,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      importedCount: run.imported_count,
      updatedCount: run.updated_count,
      skippedCount: run.skipped_count,
      duplicateCount: run.duplicate_count,
      failedCount: run.failed_count,
      errorSummary: run.error_summary,
    }));
  }

  async listIngestionErrors(): Promise<AdminIngestionError[]> {
    const result = await this.client
      .from('ingestion_errors')
      .select('id, ingestion_run_id, source_external_id, stage, code, message, created_at')
      .order('created_at', { ascending: false });
    operationError('Ingestion error query failed', result.error);
    return (result.data ?? []).map((error) => ({
      id: error.id,
      runId: error.ingestion_run_id,
      sourceExternalId: error.source_external_id,
      stage: error.stage,
      code: error.code,
      message: error.message,
      createdAt: error.created_at,
    }));
  }

  async getRankingCatalog(categorySlug: string): Promise<ExplorerCatalog | null> {
    const categories = await this.listCategories();
    const category = categories.find((candidate) => candidate.slug === categorySlug);
    if (!category) return null;

    const itemResult = await this.client
      .from('items')
      .select(
        'id, public_id, category_id, source_id, source_external_id, title, creator, source_site, canonical_source_url, image_url, price_label, buyable, note',
      )
      .eq('category_id', category.id)
      .eq('publication_status', 'published')
      .order('created_at');
    operationError('Ranking item query failed', itemResult.error);
    const itemRows = itemResult.data ?? [];
    const itemIds = itemRows.map((item) => item.id);
    const valueResult = itemIds.length
      ? await this.client
          .from('item_attribute_values')
          .select('item_id, attribute_id, value')
          .in('item_id', itemIds)
      : { data: [], error: null };
    operationError('Ranking attribute query failed', valueResult.error);

    const attributeKeyById = new Map(
      category.attributes.map((attribute) => [attribute.id, attribute.key]),
    );
    const attributesByItem = new Map<string, Record<string, number>>();
    for (const value of valueResult.data ?? []) {
      const key = attributeKeyById.get(value.attribute_id);
      if (!key) continue;
      const attributes = attributesByItem.get(value.item_id) ?? {};
      attributes[key] = Number(value.value);
      attributesByItem.set(value.item_id, attributes);
    }

    return {
      origin: 'postgres',
      category: {
        id: category.slug,
        name: category.name,
        eyebrow: category.eyebrow,
        description: category.description,
        attributes: category.attributes
          .filter((attribute) => attribute.enabled)
          .map((attribute) => ({
            key: attribute.key,
            label: attribute.label,
            lowLabel: attribute.lowLabel,
            highLabel: attribute.highLabel,
            defaultValue: attribute.defaultValue,
            weight: attribute.weight,
          })),
      },
      items: itemRows.map((item) => ({
        id: item.public_id,
        categoryId: category.slug,
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
      })),
    };
  }

  async manualImport(input: AdminItemInput): Promise<ManualImportResult> {
    const startedAt = new Date().toISOString();
    const sourceId = await this.upsertManualSource(startedAt);

    const runResult = await this.client
      .from('ingestion_runs')
      .insert({
        source_id: sourceId,
        status: 'running',
        adapter_version: MANUAL_ADAPTER_VERSION,
        started_at: startedAt,
        metadata: {
          kind: 'manual-admin-import',
          admin_user_id: this.adminUserId,
          category_id: input.categoryId,
        },
      })
      .select('id')
      .single();
    operationError('Manual ingestion run creation failed', runResult.error);
    const runId = runResult.data!.id;

    try {
      const canonicalResult = await this.client
        .from('items')
        .select('id, category_id')
        .eq('canonical_source_url', input.sourceUrl)
        .limit(1);
      operationError('Existing item lookup failed', canonicalResult.error);
      const existing = canonicalResult.data?.[0] ?? null;
      const commonFields = {
        category_id: input.categoryId,
        source_id: sourceId,
        source_external_id: input.sourceUrl,
        title: input.title,
        creator: input.creator,
        source_site: input.sourceSite,
        canonical_source_url: input.sourceUrl,
        image_url: input.imageUrl,
        price_amount: input.priceAmount,
        price_currency: input.priceCurrency,
        price_label: input.priceLabel,
        buyable: input.priceAmount !== null,
        publication_status: input.publicationStatus,
        review_status: reviewStatus(input.publicationStatus),
        last_seen_at: startedAt,
      } as const;

      let itemId: string;
      if (existing) {
        if (existing.category_id !== input.categoryId) {
          const clearResult = await this.client
            .from('item_attribute_values')
            .delete()
            .eq('item_id', existing.id);
          operationError('Previous item attributes could not be cleared', clearResult.error);
        }
        const updateResult = await this.client
          .from('items')
          .update(commonFields)
          .eq('id', existing.id)
          .select('id')
          .single();
        operationError('Manual item update failed', updateResult.error);
        itemId = updateResult.data!.id;
      } else {
        const insertResult = await this.client
          .from('items')
          .insert({ ...commonFields, public_id: `manual-${randomUUID()}` })
          .select('id')
          .single();
        operationError('Manual item creation failed', insertResult.error);
        itemId = insertResult.data!.id;
      }

      const attributeRows = Object.entries(input.attributeValues).map(([attributeId, value]) => ({
        item_id: itemId,
        attribute_id: attributeId,
        category_id: input.categoryId,
        value,
        source: 'manual' as const,
      }));
      if (attributeRows.length) {
        const valueResult = await this.client
          .from('item_attribute_values')
          .upsert(attributeRows, { onConflict: 'item_id,attribute_id' });
        operationError('Manual item attributes could not be saved', valueResult.error);
      }

      const finishedAt = new Date().toISOString();
      const completionResult = await this.client
        .from('ingestion_runs')
        .update({
          status: 'succeeded',
          finished_at: finishedAt,
          imported_count: existing ? 0 : 1,
          updated_count: existing ? 1 : 0,
        })
        .eq('id', runId);
      operationError('Manual ingestion run completion failed', completionResult.error);
      const sourceHealthResult = await this.client
        .from('sources')
        .update({ status: 'healthy', last_success_at: finishedAt })
        .eq('id', sourceId);
      operationError('Manual source status update failed', sourceHealthResult.error);

      return { itemId, runId, created: !existing };
    } catch (error) {
      const message = errorMessage(error);
      const finishedAt = new Date().toISOString();
      await this.client.from('ingestion_errors').insert({
        ingestion_run_id: runId,
        source_external_id: input.sourceUrl,
        stage: 'normalize/persist',
        code: 'MANUAL_IMPORT_FAILED',
        message,
        context: {
          admin_user_id: this.adminUserId,
          category_id: input.categoryId,
        } as Json,
      });
      await this.client
        .from('ingestion_runs')
        .update({
          status: 'failed',
          finished_at: finishedAt,
          failed_count: 1,
          error_summary: message,
        })
        .eq('id', runId);
      await this.client.from('sources').update({ status: 'degraded' }).eq('id', sourceId);
      throw error;
    }
  }

  async recordManualImportValidationFailure(
    message: string,
    sourceExternalId: string | null,
    categoryId: string | null,
  ) {
    const startedAt = new Date().toISOString();
    const sourceId = await this.upsertManualSource(startedAt);
    const runResult = await this.client
      .from('ingestion_runs')
      .insert({
        source_id: sourceId,
        status: 'failed',
        adapter_version: MANUAL_ADAPTER_VERSION,
        started_at: startedAt,
        finished_at: startedAt,
        failed_count: 1,
        error_summary: message,
        metadata: {
          kind: 'manual-admin-import',
          admin_user_id: this.adminUserId,
          category_id: categoryId,
          validation_failure: true,
        },
      })
      .select('id')
      .single();
    operationError('Failed validation run could not be recorded', runResult.error);
    const errorResult = await this.client.from('ingestion_errors').insert({
      ingestion_run_id: runResult.data!.id,
      source_external_id: sourceExternalId,
      stage: 'validate',
      code: 'MANUAL_IMPORT_INVALID',
      message,
      context: { admin_user_id: this.adminUserId, category_id: categoryId } as Json,
    });
    operationError('Failed validation error could not be recorded', errorResult.error);
    const sourceResult = await this.client
      .from('sources')
      .update({ status: 'degraded' })
      .eq('id', sourceId);
    operationError('Manual source failure state could not be recorded', sourceResult.error);
  }

  async updateItem(itemId: string, input: AdminItemInput) {
    const existing = await this.getItem(itemId);
    if (!existing) throw new Error('Item not found.');
    if (existing.categoryId !== input.categoryId) {
      throw new Error('Changing an item category is not supported by the edit form.');
    }

    const itemResult = await this.client
      .from('items')
      .update({
        title: input.title,
        creator: input.creator,
        source_site: input.sourceSite,
        source_external_id: input.sourceUrl,
        canonical_source_url: input.sourceUrl,
        image_url: input.imageUrl,
        price_amount: input.priceAmount,
        price_currency: input.priceCurrency,
        price_label: input.priceLabel,
        buyable: input.priceAmount !== null,
        publication_status: input.publicationStatus,
        review_status: reviewStatus(input.publicationStatus),
      })
      .eq('id', itemId);
    operationError('Item update failed', itemResult.error);

    const rows = Object.entries(input.attributeValues).map(([attributeId, value]) => ({
      item_id: itemId,
      attribute_id: attributeId,
      category_id: input.categoryId,
      value,
      source: 'corrected' as const,
    }));
    if (rows.length) {
      const valueResult = await this.client
        .from('item_attribute_values')
        .upsert(rows, { onConflict: 'item_id,attribute_id' });
      operationError('Item attribute update failed', valueResult.error);
    }
  }

  async archiveItem(itemId: string) {
    const result = await this.client
      .from('items')
      .update({ publication_status: 'archived' })
      .eq('id', itemId);
    operationError('Item archive failed', result.error);
  }

  async deleteItem(itemId: string) {
    const result = await this.client.from('items').delete().eq('id', itemId);
    operationError('Item deletion failed', result.error);
  }
}

export async function createSupabaseAdminRepository(context: APIContext) {
  const client = createSupabaseAuthClient(context);
  if (!client) throw new Error('Supabase is not configured for this environment.');
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || data.user.app_metadata?.role !== 'admin') {
    throw new Error('A validated administrator session is required.');
  }
  return new SupabaseAdminRepository(client, data.user.id);
}
