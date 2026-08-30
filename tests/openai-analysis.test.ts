import assert from 'node:assert/strict';
import test from 'node:test';
import { analysisReviewInitial } from '../src/lib/analysis/review';
import { parseAdminItemForm } from '../src/lib/admin/itemForm.server';
import {
  analyzePageWithOpenAI,
  createOpenAIAnalysisRequest,
  OpenAIAnalysisError,
} from '../src/lib/analysis/openai.server';
import { AnalysisWorkflowError, runRecordedUrlAnalysis } from '../src/lib/analysis/workflow.server';
import type { ExtractedPageMetadata, StructuredSemanticAnalysis } from '../src/lib/analysis/types';
import type { AdminAnalysisRun, AdminCategory } from '../src/lib/admin/types';

const category: AdminCategory = {
  id: 'category-1',
  slug: 'furniture',
  name: 'Furniture',
  status: 'published',
  eyebrow: 'Objects',
  description: 'Furniture references',
  attributes: [
    { id: 'attribute-1', key: 'minimal', label: 'Minimal', lowLabel: 'Ornate', highLabel: 'Minimal', defaultValue: 50, weight: 1, sortOrder: 0, enabled: true },
    { id: 'attribute-2', key: 'soft', label: 'Soft', lowLabel: 'Hard', highLabel: 'Soft', defaultValue: 50, weight: 1, sortOrder: 1, enabled: true },
  ],
};

const metadata: ExtractedPageMetadata = {
  requestedUrl: 'https://example.com/chair',
  finalUrl: 'https://example.com/chair',
  canonicalUrl: 'https://example.com/chair',
  title: 'Cloud Chair',
  ogTitle: 'Cloud Chair',
  description: 'A soft, simple chair.',
  imageUrl: 'https://example.com/chair.jpg',
  siteName: 'Example',
  domain: 'example.com',
  creator: 'Studio One',
  priceAmount: 400,
  priceCurrency: 'EUR',
  raw: {},
};

const structured: StructuredSemanticAnalysis = {
  summary: 'A restrained chair with a soft silhouette.',
  detected_title: 'Cloud Chair',
  detected_creator: 'Studio One',
  detected_product_type: 'chair',
  attributes: [
    { attribute_key: 'minimal', value: 82, confidence: 0.9, reason: 'Few visible details.' },
    { attribute_key: 'soft', value: 76, confidence: 0.84, reason: 'Rounded upholstered form.' },
  ],
};

test('builds a strict dynamic schema and includes the image URL', () => {
  const request = createOpenAIAnalysisRequest('gpt-5.6', category, metadata);
  assert.equal(request.model, 'gpt-5.6');
  assert.equal(request.text.format.strict, true);
  assert.deepEqual(request.text.format.schema.properties.attributes.items.properties.attribute_key.enum, ['minimal', 'soft']);
  const user = request.input[1]!;
  assert.equal(user.content.some((part) => part.type === 'input_image'), true);
});

test('parses mocked Responses API structured output and usage', async () => {
  let capturedBody: Record<string, unknown> | null = null;
  const result = await analyzePageWithOpenAI(metadata, category, {
    apiKey: 'test-key-not-real',
    model: 'gpt-5.6',
    fetchImpl: async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        id: 'resp_test',
        status: 'completed',
        model: 'gpt-5.6',
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(structured) }] }],
        usage: { input_tokens: 120, output_tokens: 80, total_tokens: 200 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal((capturedBody as unknown as { store: boolean }).store, false);
  assert.equal(result.structured.attributes[0]?.value, 82);
  assert.deepEqual(result.usage, { input_tokens: 120, output_tokens: 80, total_tokens: 200 });
});

test('surfaces an OpenAI API failure', async () => {
  await assert.rejects(
    () => analyzePageWithOpenAI(metadata, category, {
      apiKey: 'test-key-not-real',
      model: 'gpt-5.6',
      fetchImpl: async () => new Response(
        JSON.stringify({ error: { message: 'mock rate limit' } }),
        { status: 429, headers: { 'content-type': 'application/json' } },
      ),
    }),
    (error: unknown) => error instanceof OpenAIAnalysisError && /mock rate limit/.test(error.message),
  );
});

test('records the OpenAI stage when analysis fails and creates no item', async () => {
  let failureStage = '';
  let successCalled = false;
  await assert.rejects(
    () => runRecordedUrlAnalysis('https://example.com/chair', category, {
      succeed: async () => { successCalled = true; },
      fail: async (failure) => { failureStage = failure.stage; },
    }, {
      fetchMetadata: async () => metadata,
      analyze: async () => { throw new OpenAIAnalysisError('mocked model failure'); },
      now: (() => { let time = 1000; return () => (time += 25); })(),
    }),
    (error: unknown) => error instanceof AnalysisWorkflowError && error.failure.stage === 'openai',
  );
  assert.equal(failureStage, 'openai');
  assert.equal(successCalled, false);
});

test('maps a successful analysis into the existing generic review form', () => {
  const run: AdminAnalysisRun = {
    id: 'run-1', itemId: null, itemTitle: null, categoryId: category.id,
    categoryName: category.name, categorySlug: category.slug,
    sourceUrl: metadata.canonicalUrl, status: 'succeeded', provider: 'openai', model: 'gpt-5.6',
    schemaVersion: 'semantic-attributes-v1', promptVersion: 'url-metadata-vision-v1', attempt: 1,
    startedAt: null, finishedAt: null, runtimeMs: 100, structuredResult: structured,
    rawResult: { metadata: metadata as unknown as Record<string, never> }, usageMetadata: {},
    errorMessage: null, createdAt: new Date(0).toISOString(),
  };
  const initial = analysisReviewInitial(run, category);
  assert.equal(initial.publicationStatus, 'review');
  assert.equal(initial.title, 'Cloud Chair');
  assert.equal(initial.attributes['attribute-1'], 82);
  assert.equal(initial.attributes['attribute-2'], 76);
});

test('accepts administrator corrections through the shared generic item parser', () => {
  const form = new FormData();
  form.set('categoryId', category.id);
  form.set('title', 'Corrected Cloud Chair');
  form.set('sourceUrl', metadata.canonicalUrl);
  form.set('imageUrl', metadata.imageUrl!);
  form.set('creator', 'Corrected Studio');
  form.set('sourceSite', metadata.siteName);
  form.set('priceAmount', '425');
  form.set('priceCurrency', 'eur');
  form.set('publicationStatus', 'review');
  form.set('attribute:attribute-1', '70');
  form.set('attribute:attribute-2', '88');

  const parsed = parseAdminItemForm(form, [category]);
  assert.equal(parsed.title, 'Corrected Cloud Chair');
  assert.equal(parsed.publicationStatus, 'review');
  assert.equal(parsed.priceCurrency, 'EUR');
  assert.deepEqual(parsed.attributeValues, { 'attribute-1': 70, 'attribute-2': 88 });
});
