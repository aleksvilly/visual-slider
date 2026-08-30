import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pantsCategory } from '../src/data/categories';
import { pantsItems } from '../src/data/pants';
import { getSupabaseSecretConfig } from '../src/lib/supabase/config.server';

const config = getSupabaseSecretConfig();
const supabase = createClient(config.url, config.secretKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});

function fail(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

const now = new Date().toISOString();
const sourceResult = await supabase
  .from('sources')
  .upsert(
    {
      slug: 'pants-demo',
      name: 'Pants prototype seed',
      adapter_type: 'manual-seed',
      enabled: true,
      display_policy: 'LINK_ONLY',
      adapter_version: '1.0.0',
      configuration: { fixture: 'src/data/pants.ts' },
      status: 'running',
      last_run_at: now,
    },
    { onConflict: 'slug' },
  )
  .select('id')
  .single();
fail('Source upsert failed', sourceResult.error);
const sourceId = sourceResult.data!.id;

const runResult = await supabase
  .from('ingestion_runs')
  .insert({
    source_id: sourceId,
    status: 'running',
    adapter_version: '1.0.0',
    started_at: now,
    metadata: { kind: 'demo-seed' },
  })
  .select('id')
  .single();
fail('Ingestion run creation failed', runResult.error);
const runId = runResult.data!.id;

try {
  const categoryResult = await supabase
    .from('categories')
    .upsert(
      {
        slug: pantsCategory.id,
        name: pantsCategory.name,
        eyebrow: pantsCategory.eyebrow,
        description: pantsCategory.description,
        status: 'published',
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .single();
  fail('Category upsert failed', categoryResult.error);
  const categoryId = categoryResult.data!.id;

  const attributeResult = await supabase
    .from('attribute_definitions')
    .upsert(
      pantsCategory.attributes.map((attribute, sortOrder) => ({
        category_id: categoryId,
        key: attribute.key,
        label: attribute.label,
        low_label: attribute.lowLabel,
        high_label: attribute.highLabel,
        default_value: attribute.defaultValue,
        weight: attribute.weight ?? 1,
        sort_order: sortOrder,
        enabled: true,
      })),
      { onConflict: 'category_id,key' },
    )
    .select('id, key');
  fail('Attribute upsert failed', attributeResult.error);
  const attributeIds = new Map(
    (attributeResult.data ?? []).map((attribute) => [attribute.key, attribute.id]),
  );

  const existingResult = await supabase
    .from('items')
    .select('public_id')
    .in('public_id', pantsItems.map((item) => item.id));
  fail('Existing item lookup failed', existingResult.error);
  const existingIds = new Set((existingResult.data ?? []).map((item) => item.public_id));

  const itemResult = await supabase
    .from('items')
    .upsert(
      pantsItems.map((item) => ({
        public_id: item.id,
        category_id: categoryId,
        source_id: sourceId,
        source_external_id: item.id,
        title: item.title,
        creator: item.creator ?? null,
        source_site: item.sourceSite,
        canonical_source_url: item.sourceUrl ?? null,
        image_url: item.imageUrl,
        price_label: item.priceLabel ?? null,
        buyable: item.buyable ?? false,
        note: item.note ?? null,
        publication_status: 'published',
        review_status: 'approved',
        last_seen_at: now,
      })),
      { onConflict: 'public_id' },
    )
    .select('id, public_id');
  fail('Item upsert failed', itemResult.error);

  const itemIds = new Map((itemResult.data ?? []).map((item) => [item.public_id, item.id]));
  const valueRows = pantsItems.flatMap((item) =>
    Object.entries(item.attributes).map(([key, value]) => {
      const itemId = itemIds.get(item.id);
      const attributeId = attributeIds.get(key);
      if (!itemId || !attributeId) throw new Error(`Missing IDs for ${item.id}.${key}.`);
      return {
        item_id: itemId,
        attribute_id: attributeId,
        category_id: categoryId,
        value,
        source: 'manual',
      };
    }),
  );
  const valueResult = await supabase
    .from('item_attribute_values')
    .upsert(valueRows, { onConflict: 'item_id,attribute_id' });
  fail('Item attribute upsert failed', valueResult.error);

  const importedCount = pantsItems.filter((item) => !existingIds.has(item.id)).length;
  const updatedCount = pantsItems.length - importedCount;
  const finishedAt = new Date().toISOString();
  fail(
    'Ingestion run completion failed',
    (
      await supabase
        .from('ingestion_runs')
        .update({
          status: 'succeeded',
          finished_at: finishedAt,
          imported_count: importedCount,
          updated_count: updatedCount,
        })
        .eq('id', runId)
    ).error,
  );
  fail(
    'Source status update failed',
    (
      await supabase
        .from('sources')
        .update({ status: 'healthy', last_success_at: finishedAt })
        .eq('id', sourceId)
    ).error,
  );

  console.log(
    `Seeded Pants into ${config.projectRef}: ${importedCount} imported, ${updatedCount} updated, ${valueRows.length} attribute values.`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown seed failure';
  const finishedAt = new Date().toISOString();
  await supabase
    .from('ingestion_runs')
    .update({ status: 'failed', finished_at: finishedAt, failed_count: 1, error_summary: message })
    .eq('id', runId);
  await supabase.from('sources').update({ status: 'degraded' }).eq('id', sourceId);
  throw error;
}
