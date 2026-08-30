import { categories } from '../../data/categories';
import { pantsItems } from '../../data/pants';

export interface AdminTableColumn {
  key: string;
  label: string;
}

export interface AdminSectionDefinition {
  slug: string;
  title: string;
  eyebrow: string;
  description: string;
  emptyMessage?: string;
  columns: AdminTableColumn[];
  rows: Record<string, string | number | boolean>[];
}

const categoryRows = categories.map((category) => ({
  category: category.name,
  key: category.id,
  status: 'Prototype',
  attributes: category.attributes.length,
  items: pantsItems.filter((item) => item.categoryId === category.id).length,
}));

const attributeRows = categories.flatMap((category) =>
  category.attributes.map((attribute, index) => ({
    category: category.name,
    attribute: attribute.label,
    key: attribute.key,
    range: `${attribute.lowLabel} → ${attribute.highLabel}`,
    default: attribute.defaultValue,
    weight: attribute.weight ?? 1,
    order: index + 1,
  })),
);

const itemRows = pantsItems.map((item) => ({
  item: item.title,
  category: item.categoryId,
  creator: item.creator ?? 'Unknown',
  source: item.sourceSite,
  state: item.sourceUrl ? 'Reference' : 'Demo',
  coverage: `${Object.keys(item.attributes).length}/6`,
}));

export const adminSections: AdminSectionDefinition[] = [
  {
    slug: 'categories',
    title: 'Categories',
    eyebrow: 'Discovery vocabulary',
    description:
      'Categories own their slider vocabulary and ranking configuration. This view currently reflects the checked-in repository fallback.',
    columns: [
      { key: 'category', label: 'Category' },
      { key: 'key', label: 'Key' },
      { key: 'status', label: 'Status' },
      { key: 'attributes', label: 'Attributes' },
      { key: 'items', label: 'Items' },
    ],
    rows: categoryRows,
  },
  {
    slug: 'attributes',
    title: 'Attributes',
    eyebrow: 'Semantic dimensions',
    description:
      'Continuous category-specific values stay normalized to 0–100. Weight controls how strongly a dimension affects semantic distance.',
    columns: [
      { key: 'category', label: 'Category' },
      { key: 'attribute', label: 'Attribute' },
      { key: 'key', label: 'Key' },
      { key: 'range', label: 'Range' },
      { key: 'default', label: 'Default' },
      { key: 'weight', label: 'Weight' },
      { key: 'order', label: 'Order' },
    ],
    rows: attributeRows,
  },
  {
    slug: 'items',
    title: 'Items',
    eyebrow: 'Canonical catalog',
    description:
      'The canonical item read model keeps category, source attribution, and extensible semantic attributes separate from source parsing.',
    columns: [
      { key: 'item', label: 'Item' },
      { key: 'category', label: 'Category' },
      { key: 'creator', label: 'Creator' },
      { key: 'source', label: 'Source' },
      { key: 'state', label: 'Kind' },
      { key: 'coverage', label: 'Attribute coverage' },
    ],
    rows: itemRows,
  },
  {
    slug: 'sources',
    title: 'Sources',
    eyebrow: 'Ingestion origins',
    description:
      'Sources own adapter configuration, version, policy, and operational status. Secrets are intentionally excluded from this model.',
    columns: [
      { key: 'source', label: 'Source' },
      { key: 'adapter', label: 'Adapter' },
      { key: 'version', label: 'Version' },
      { key: 'enabled', label: 'Enabled' },
      { key: 'status', label: 'Status' },
      { key: 'lastRun', label: 'Last run' },
    ],
    rows: [
      {
        source: 'Pants prototype seed',
        adapter: 'checked-in seed',
        version: '0.1.0',
        enabled: true,
        status: 'Fallback if unconfigured',
        lastRun: 'Not ingested',
      },
    ],
  },
  {
    slug: 'ingestion',
    title: 'Ingestion runs',
    eyebrow: 'Source operations',
    description:
      'Every adapter execution will record its version, state, counts, timing, and error summary here.',
    emptyMessage: 'No ingestion runs yet. The source-adapter pipeline starts in Phase 2.',
    columns: [
      { key: 'source', label: 'Source' },
      { key: 'status', label: 'Status' },
      { key: 'started', label: 'Started' },
      { key: 'imported', label: 'Imported' },
      { key: 'updated', label: 'Updated' },
      { key: 'skipped', label: 'Skipped' },
      { key: 'duplicates', label: 'Duplicates' },
      { key: 'failed', label: 'Failed' },
    ],
    rows: [],
  },
  {
    slug: 'analysis',
    title: 'AI analysis runs',
    eyebrow: 'Versioned offline analysis',
    description:
      'Analysis history will preserve model, schema, prompt version, structured output, usage, retry state, and errors.',
    emptyMessage: 'No AI analysis runs yet. Interactive ranking makes no AI calls.',
    columns: [
      { key: 'item', label: 'Item' },
      { key: 'status', label: 'Status' },
      { key: 'provider', label: 'Provider / model' },
      { key: 'schema', label: 'Schema' },
      { key: 'prompt', label: 'Prompt' },
      { key: 'finished', label: 'Finished' },
    ],
    rows: [],
  },
  {
    slug: 'errors',
    title: 'Errors',
    eyebrow: 'Operational diagnostics',
    description:
      'Per-item ingestion failures will retain pipeline stage, a stable code, human-readable message, and structured context.',
    emptyMessage: 'No recorded ingestion errors.',
    columns: [
      { key: 'time', label: 'Time' },
      { key: 'run', label: 'Run' },
      { key: 'stage', label: 'Stage' },
      { key: 'item', label: 'Source item' },
      { key: 'message', label: 'Message' },
    ],
    rows: [],
  },
  {
    slug: 'duplicates',
    title: 'Duplicate / review queue',
    eyebrow: 'Catalog quality',
    description:
      'Potential duplicates remain reviewable, with reason, confidence, and resolution state instead of being silently discarded.',
    emptyMessage: 'No duplicate candidates are waiting for review.',
    columns: [
      { key: 'item', label: 'Item' },
      { key: 'candidate', label: 'Candidate' },
      { key: 'reason', label: 'Reason' },
      { key: 'confidence', label: 'Confidence' },
      { key: 'status', label: 'Status' },
    ],
    rows: [],
  },
];

export const adminSummary = {
  categories: categories.length,
  attributes: attributeRows.length,
  items: pantsItems.length,
  sources: 1,
  openErrors: 0,
  reviewQueue: 0,
  storage: 'Seed repository fallback',
};
