import type { AdminCategory } from '../admin/types';
import type { Json } from '../supabase/database.types';
import { getOpenAIAnalysisConfig } from './config.server';
import {
  ANALYSIS_PROMPT_VERSION,
  ANALYSIS_SCHEMA_VERSION,
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
  ExtractedPageMetadata,
  OpenAIAnalysisResult,
} from './types';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_TIMEOUT_MS = 28_000;

export { ANALYSIS_PROMPT_VERSION, ANALYSIS_SCHEMA_VERSION };

export class OpenAIAnalysisError extends AnalysisProviderError {
  constructor(
    message: string,
    kind: AnalysisProviderErrorKind = 'invalid_output',
    statusCode: number | null = null,
    diagnostic: Json = {},
  ) {
    super(message, kind, statusCode, diagnostic);
  }
}

export function createOpenAIAnalysisRequest(
  model: string,
  category: AdminCategory,
  metadata: ExtractedPageMetadata,
) {
  const evidence = createAnalysisEvidence(category, metadata);
  const content: Array<Record<string, unknown>> = [
    { type: 'input_text', text: JSON.stringify(evidence.payload) },
  ];
  if (metadata.imageUrl) {
    content.push({ type: 'input_image', image_url: metadata.imageUrl, detail: 'low' });
  }
  return {
    model,
    store: false,
    max_output_tokens: 2_500,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: ANALYSIS_SYSTEM_PROMPT }],
      },
      { role: 'user', content },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'visual_slider_semantic_analysis',
        strict: true,
        schema: createAnalysisSchema(evidence.attributeKeys),
      },
    },
  };
}

function outputText(response: Record<string, unknown>) {
  if (typeof response.output_text === 'string') return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as unknown[]
      : [];
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const object = part as Record<string, unknown>;
      if (object.type === 'refusal') {
        throw new OpenAIAnalysisError(
          `OpenAI refused the analysis: ${String(object.refusal ?? 'no reason supplied')}`,
          'request_rejected',
        );
      }
      if (object.type === 'output_text' && typeof object.text === 'string') return object.text;
    }
  }
  throw new OpenAIAnalysisError('OpenAI returned no structured output text.');
}

export async function analyzePageWithOpenAI(
  metadata: ExtractedPageMetadata,
  category: AdminCategory,
  options: {
    apiKey?: string;
    model?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<OpenAIAnalysisResult> {
  const configured = getOpenAIAnalysisConfig();
  const apiKey = options.apiKey ?? configured.apiKey;
  const model = options.model ?? configured.model;
  if (!apiKey) {
    throw new OpenAIAnalysisError(
      'OPENAI_API_KEY is not configured for this environment.',
      'provider_unavailable',
    );
  }
  const requestBody = createOpenAIAnalysisRequest(model, category, metadata);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? OPENAI_TIMEOUT_MS);
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof AnalysisProviderError) throw error;
    const timedOut = error instanceof Error && error.name === 'AbortError';
    throw new OpenAIAnalysisError(
      timedOut
        ? 'OpenAI analysis timed out.'
        : `OpenAI request failed: ${error instanceof Error ? error.message : 'unknown network error'}`,
      timedOut ? 'timeout' : 'provider_unavailable',
    );
  } finally {
    clearTimeout(timeout);
  }

  const responseBody = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const apiError = responseBody?.error as Record<string, unknown> | undefined;
    const classified = providerHttpError(
      'OpenAI',
      response.status,
      String(apiError?.message ?? 'request failed'),
      (responseBody ?? {}) as Json,
    );
    throw new OpenAIAnalysisError(classified.message, classified.kind, classified.statusCode, classified.diagnostic);
  }
  if (!responseBody) throw new OpenAIAnalysisError('OpenAI returned an unreadable response.');
  const failureDiagnostic = {
    id: responseBody.id ?? null,
    actual_model: responseBody.model ?? model,
    usage: responseBody.usage ?? {},
  } as unknown as Json;
  if (responseBody.status === 'incomplete') {
    throw new OpenAIAnalysisError(
      `OpenAI analysis was incomplete: ${JSON.stringify(responseBody.incomplete_details ?? {})}`,
      'invalid_output',
      null,
      failureDiagnostic,
    );
  }
  const evidence = createAnalysisEvidence(category, metadata);
  let structured;
  try {
    structured = parseStructuredAnalysis(outputText(responseBody), evidence.attributeKeys);
  } catch (error) {
    if (error instanceof AnalysisProviderError) throw error;
    throw new OpenAIAnalysisError(
      error instanceof StructuredAnalysisError ? error.message : 'OpenAI structured output could not be parsed.',
      'invalid_output',
      null,
      failureDiagnostic,
    );
  }
  const actualModel = String(responseBody.model ?? model);
  return {
    provider: 'openai',
    requestedModel: model,
    actualModel,
    model: actualModel,
    structured,
    usage: (responseBody.usage ?? {}) as Json,
    raw: {
      id: responseBody.id ?? null,
      status: responseBody.status ?? null,
      model: actualModel,
      output: responseBody.output ?? [],
    } as unknown as Json,
  };
}

export class OpenAIProvider implements AnalysisProvider {
  readonly name = 'openai';
  readonly requestedModel: string;

  constructor(
    private readonly options: {
      apiKey?: string;
      model?: string;
      fetchImpl?: typeof fetch;
      timeoutMs?: number;
    } = {},
  ) {
    this.requestedModel = options.model ?? getOpenAIAnalysisConfig().model;
  }

  analyze(metadata: ExtractedPageMetadata, category: AdminCategory) {
    return analyzePageWithOpenAI(metadata, category, {
      ...this.options,
      model: this.requestedModel,
    });
  }
}
