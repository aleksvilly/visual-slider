import type { AdminCategory } from '../admin/types';
import type { Json } from '../supabase/database.types';
import { getOpenRouterAnalysisConfig } from './config.server';
import {
  ANALYSIS_SYSTEM_PROMPT,
  createAnalysisEvidence,
  createAnalysisSchema,
  parseStructuredAnalysis,
  StructuredAnalysisError,
} from './contract';
import {
  AnalysisProviderError,
  providerHttpError,
  type AnalysisProvider,
} from './provider';
import type {
  AnalysisProviderErrorKind,
  AnalysisProviderResult,
  ExtractedPageMetadata,
} from './types';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_TIMEOUT_MS = 18_000;

export class OpenRouterAnalysisError extends AnalysisProviderError {
  constructor(
    message: string,
    kind: AnalysisProviderErrorKind = 'invalid_output',
    statusCode: number | null = null,
    diagnostic: Json = {},
  ) {
    super(message, kind, statusCode, diagnostic);
  }
}

export function createOpenRouterAnalysisRequest(
  model: string,
  category: AdminCategory,
  metadata: ExtractedPageMetadata,
) {
  const evidence = createAnalysisEvidence(category, metadata);
  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: JSON.stringify(evidence.payload) },
  ];
  if (metadata.imageUrl) {
    content.push({ type: 'image_url', image_url: { url: metadata.imageUrl } });
  }
  return {
    model,
    messages: [
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'visual_slider_semantic_analysis',
        strict: true,
        schema: createAnalysisSchema(evidence.attributeKeys),
      },
    },
    provider: { require_parameters: true },
    max_tokens: 2_500,
    stream: false,
  };
}

export async function analyzePageWithOpenRouter(
  metadata: ExtractedPageMetadata,
  category: AdminCategory,
  options: {
    apiKey?: string;
    model?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<AnalysisProviderResult> {
  const configured = getOpenRouterAnalysisConfig();
  const apiKey = options.apiKey ?? configured.apiKey;
  const model = options.model ?? configured.model;
  if (!apiKey) {
    throw new OpenRouterAnalysisError(
      'OPENROUTER_API_KEY is not configured for this environment.',
      'provider_unavailable',
    );
  }
  const requestBody = createOpenRouterAnalysisRequest(model, category, metadata);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? OPENROUTER_TIMEOUT_MS);
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-OpenRouter-Title': 'Visual Slider',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof AnalysisProviderError) throw error;
    const timedOut = error instanceof Error && error.name === 'AbortError';
    throw new OpenRouterAnalysisError(
      timedOut
        ? 'OpenRouter analysis timed out.'
        : `OpenRouter request failed: ${error instanceof Error ? error.message : 'unknown network error'}`,
      timedOut ? 'timeout' : 'provider_unavailable',
    );
  } finally {
    clearTimeout(timeout);
  }

  const responseBody = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const apiError = responseBody?.error as Record<string, unknown> | undefined;
    const classified = providerHttpError(
      'OpenRouter',
      response.status,
      String(apiError?.message ?? 'request failed'),
      (responseBody ?? {}) as Json,
    );
    throw new OpenRouterAnalysisError(classified.message, classified.kind, classified.statusCode, classified.diagnostic);
  }
  if (!responseBody) throw new OpenRouterAnalysisError('OpenRouter returned an unreadable response.');
  const failureDiagnostic = {
    id: responseBody.id ?? null,
    actual_model: responseBody.model ?? model,
    provider: responseBody.provider ?? null,
    usage: responseBody.usage ?? {},
  } as unknown as Json;
  const choices = Array.isArray(responseBody.choices) ? responseBody.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new OpenRouterAnalysisError('OpenRouter returned no structured output text.', 'invalid_output', null, failureDiagnostic);
  }
  const evidence = createAnalysisEvidence(category, metadata);
  let structured;
  try {
    structured = parseStructuredAnalysis(content, evidence.attributeKeys);
  } catch (error) {
    throw new OpenRouterAnalysisError(
      error instanceof StructuredAnalysisError ? error.message : 'OpenRouter structured output could not be parsed.',
      'invalid_output',
      null,
      failureDiagnostic,
    );
  }
  const actualModel = String(responseBody.model ?? model);
  return {
    provider: 'openrouter',
    requestedModel: model,
    actualModel,
    model: actualModel,
    structured,
    usage: (responseBody.usage ?? {}) as Json,
    raw: {
      id: responseBody.id ?? null,
      provider: responseBody.provider ?? null,
      requested_model: model,
      actual_model: actualModel,
      finish_reason: firstChoice?.finish_reason ?? null,
      openrouter_metadata: responseBody.openrouter_metadata ?? null,
    } as unknown as Json,
  };
}

export class OpenRouterProvider implements AnalysisProvider {
  readonly name = 'openrouter';
  readonly requestedModel: string;

  constructor(
    private readonly options: {
      apiKey?: string;
      model?: string;
      fetchImpl?: typeof fetch;
      timeoutMs?: number;
    } = {},
  ) {
    this.requestedModel = options.model ?? getOpenRouterAnalysisConfig().model;
  }

  analyze(metadata: ExtractedPageMetadata, category: AdminCategory) {
    return analyzePageWithOpenRouter(metadata, category, {
      ...this.options,
      model: this.requestedModel,
    });
  }
}
