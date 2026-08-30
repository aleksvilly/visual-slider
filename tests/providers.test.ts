import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdminCategory } from '../src/lib/admin/types';
import { AnalysisInputError } from '../src/lib/analysis/contract';
import { MetadataFetchError } from '../src/lib/analysis/metadata.server';
import { OpenAIProvider } from '../src/lib/analysis/openai.server';
import {
  analyzePageWithOpenRouter,
  createOpenRouterAnalysisRequest,
  OpenRouterProvider,
} from '../src/lib/analysis/openrouter.server';
import { analyzePageWithProviders } from '../src/lib/analysis/providers.server';
import type { ExtractedPageMetadata, StructuredSemanticAnalysis } from '../src/lib/analysis/types';
import { AnalysisWorkflowError, runRecordedUrlAnalysis } from '../src/lib/analysis/workflow.server';

const category: AdminCategory = {
  id: 'category-1',
  slug: 'pants',
  name: 'Pants',
  status: 'published',
  eyebrow: 'Fashion',
  description: 'Silhouette-driven pants references.',
  attributes: [
    { id: 'attribute-1', key: 'square', label: 'Square', lowLabel: 'Normal', highLabel: 'Square', defaultValue: 50, weight: 1, sortOrder: 0, enabled: true },
    { id: 'attribute-2', key: 'volume', label: 'Volume', lowLabel: 'Slim', highLabel: 'Huge', defaultValue: 50, weight: 1, sortOrder: 1, enabled: true },
  ],
};

const metadata: ExtractedPageMetadata = {
  requestedUrl: 'https://www.kseniaschnaider.com/products/square-voluminous-pants',
  finalUrl: 'https://www.kseniaschnaider.com/products/square-voluminous-pants',
  canonicalUrl: 'https://www.kseniaschnaider.com/products/square-voluminous-pants',
  title: 'Square Voluminous Pants',
  ogTitle: 'Square Voluminous Pants',
  description: 'A voluminous square silhouette.',
  imageUrl: 'https://www.kseniaschnaider.com/cdn/shop/files/example.jpg',
  siteName: 'KSENIASCHNAIDER',
  domain: 'www.kseniaschnaider.com',
  creator: 'KSENIASCHNAIDER',
  priceAmount: 500,
  priceCurrency: 'EUR',
  raw: {},
};

const structured: StructuredSemanticAnalysis = {
  summary: 'A strongly geometric, high-volume pants silhouette.',
  detected_title: 'Square Voluminous Pants',
  detected_creator: 'KSENIASCHNAIDER',
  detected_product_type: 'pants',
  attributes: [
    { attribute_key: 'square', value: 92, confidence: 0.96, reason: 'The silhouette is explicitly square.' },
    { attribute_key: 'volume', value: 88, confidence: 0.93, reason: 'The legs have pronounced volume.' },
  ],
};

function openRouterSuccess(model = 'qwen/qwen3-vl-30b-a3b-thinking') {
  return new Response(JSON.stringify({
    id: 'gen-test',
    provider: 'Example upstream',
    model,
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(structured) } }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function openAISuccess() {
  return new Response(JSON.stringify({
    id: 'resp-fallback',
    status: 'completed',
    model: 'gpt-5.6',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(structured) }] }],
    usage: { input_tokens: 120, output_tokens: 70, total_tokens: 190 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('OpenRouter mocked success captures the actual model and structured output', async () => {
  const result = await analyzePageWithOpenRouter(metadata, category, {
    apiKey: 'openrouter-test-key-not-real',
    model: 'openrouter/free',
    fetchImpl: async () => openRouterSuccess(),
  });
  assert.equal(result.provider, 'openrouter');
  assert.equal(result.requestedModel, 'openrouter/free');
  assert.equal(result.actualModel, 'qwen/qwen3-vl-30b-a3b-thinking');
  assert.equal(result.structured.attributes[0]?.attribute_key, 'square');
  assert.equal(result.structured.attributes[0]?.value, 92);
  assert.deepEqual(result.usage, { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 });
});

test('OpenRouter request uses strict JSON Schema and the documented vision shape', () => {
  const request = createOpenRouterAnalysisRequest('openrouter/free', category, metadata);
  assert.equal(request.response_format.type, 'json_schema');
  assert.equal(request.response_format.json_schema.strict, true);
  assert.equal(request.provider.require_parameters, true);
  const content = request.messages[1]!.content as Array<Record<string, unknown>>;
  assert.deepEqual(content[1], {
    type: 'image_url',
    image_url: { url: metadata.imageUrl },
  });
});

test('OpenRouter 429 falls back to OpenAI and records both attempts', async () => {
  const result = await analyzePageWithProviders(metadata, category, {
    providers: [
      new OpenRouterProvider({
        apiKey: 'openrouter-test-key-not-real',
        model: 'openrouter/free',
        fetchImpl: async () => new Response(
          JSON.stringify({ error: { message: 'quota exceeded' } }),
          { status: 429, headers: { 'content-type': 'application/json' } },
        ),
      }),
      new OpenAIProvider({
        apiKey: 'openai-test-key-not-real',
        model: 'gpt-5.6',
        fetchImpl: async () => openAISuccess(),
      }),
    ],
  });
  assert.equal(result.provider, 'openai');
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0]?.errorKind, 'rate_limit');
  assert.equal(result.attempts[0]?.status, 'failed');
  assert.equal(result.attempts[1]?.status, 'succeeded');
});

test('OpenRouter malformed JSON falls back to OpenAI', async () => {
  const malformedProvider = new OpenRouterProvider({
    apiKey: 'openrouter-test-key-not-real',
    model: 'openrouter/free',
    fetchImpl: async () => new Response(JSON.stringify({
      model: 'free/model',
      choices: [{ message: { content: '{not-json' } }],
      usage: {},
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  const result = await analyzePageWithProviders(metadata, category, {
    providers: [
      malformedProvider,
      new OpenAIProvider({
        apiKey: 'openai-test-key-not-real',
        model: 'gpt-5.6',
        fetchImpl: async () => openAISuccess(),
      }),
    ],
  });
  assert.equal(result.provider, 'openai');
  assert.equal(result.attempts[0]?.errorKind, 'invalid_output');
  assert.equal(result.attempts[0]?.actualModel, 'free/model');
});

test('OpenRouter authentication errors do not fall back', async () => {
  let openAICalls = 0;
  await assert.rejects(
    () => analyzePageWithProviders(metadata, category, {
      providers: [
        new OpenRouterProvider({
          apiKey: 'invalid-openrouter-key',
          model: 'openrouter/free',
          fetchImpl: async () => new Response(
            JSON.stringify({ error: { message: 'invalid API key' } }),
            { status: 401, headers: { 'content-type': 'application/json' } },
          ),
        }),
        {
          name: 'openai',
          requestedModel: 'gpt-5.6',
          analyze: async () => { openAICalls += 1; throw new Error('must not run'); },
        },
      ],
    }),
    /invalid API key/,
  );
  assert.equal(openAICalls, 0);
});

test('metadata and SSRF failures occur before analysis providers and never fall back', async () => {
  let providerCalls = 0;
  let recordedAttempts = -1;
  await assert.rejects(
    () => runRecordedUrlAnalysis('http://127.0.0.1/private', category, {
      succeed: async () => assert.fail('metadata rejection must not succeed'),
      fail: async (failure) => { recordedAttempts = failure.providerAttempts.length; },
    }, {
      fetchMetadata: async () => { throw new MetadataFetchError('Private or reserved network addresses are not allowed.'); },
      analyze: async () => { providerCalls += 1; throw new Error('must not run'); },
    }),
    (error: unknown) => error instanceof AnalysisWorkflowError && error.failure.stage === 'metadata_fetch',
  );
  assert.equal(providerCalls, 0);
  assert.equal(recordedAttempts, 0);
});

test('invalid categories are rejected before provider attempts', async () => {
  let providerCalls = 0;
  const invalidCategory = {
    ...category,
    attributes: category.attributes.map((attribute) => ({ ...attribute, enabled: false })),
  };
  await assert.rejects(
    () => analyzePageWithProviders(metadata, invalidCategory, {
      providers: [{
        name: 'must-not-run',
        requestedModel: 'none',
        analyze: async () => { providerCalls += 1; throw new Error('must not run'); },
      }],
    }),
    AnalysisInputError,
  );
  assert.equal(providerCalls, 0);
});
