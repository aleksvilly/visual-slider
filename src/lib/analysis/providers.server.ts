import type { AdminCategory } from '../admin/types';
import type { Json } from '../supabase/database.types';
import { createAnalysisEvidence } from './contract';
import { OpenAIProvider } from './openai.server';
import { OpenRouterProvider } from './openrouter.server';
import { AnalysisProviderError, type AnalysisProvider } from './provider';
import type {
  AnalysisProviderAttempt,
  AnalysisResult,
  ExtractedPageMetadata,
} from './types';

export class AnalysisProvidersExhaustedError extends Error {
  constructor(
    message: string,
    readonly attempts: AnalysisProviderAttempt[],
    readonly finalError: AnalysisProviderError,
  ) {
    super(message);
  }
}

export function createDefaultAnalysisProviders(): AnalysisProvider[] {
  return [new OpenRouterProvider(), new OpenAIProvider()];
}

export function getDefaultProviderDescriptors() {
  return createDefaultAnalysisProviders().map((provider) => ({
    provider: provider.name,
    requestedModel: provider.requestedModel,
  }));
}

export async function analyzePageWithProviders(
  metadata: ExtractedPageMetadata,
  category: AdminCategory,
  options: {
    providers?: AnalysisProvider[];
    now?: () => number;
  } = {},
): Promise<AnalysisResult> {
  // Category/input errors happen before provider attempts and are never fallback candidates.
  createAnalysisEvidence(category, metadata);
  const providers = options.providers ?? createDefaultAnalysisProviders();
  if (!providers.length) {
    throw new AnalysisProviderError('No analysis providers are configured.', 'provider_unavailable');
  }
  const now = options.now ?? Date.now;
  const attempts: AnalysisProviderAttempt[] = [];

  for (const [index, provider] of providers.entries()) {
    const startedAt = now();
    try {
      const result = await provider.analyze(metadata, category);
      attempts.push({
        attempt: index + 1,
        provider: provider.name,
        requestedModel: provider.requestedModel,
        actualModel: result.actualModel,
        status: 'succeeded',
        runtimeMs: Math.max(0, now() - startedAt),
        usage: result.usage,
        error: null,
        errorKind: null,
      });
      return { ...result, attempts };
    } catch (error) {
      const providerError = error instanceof AnalysisProviderError
        ? error
        : new AnalysisProviderError(
          error instanceof Error ? error.message : 'Unknown provider failure',
          'request_rejected',
          null,
          {} as Json,
        );
      const diagnostic = providerError.diagnostic && typeof providerError.diagnostic === 'object' && !Array.isArray(providerError.diagnostic)
        ? providerError.diagnostic as Record<string, unknown>
        : {};
      const actualModel = typeof diagnostic.actual_model === 'string'
        ? diagnostic.actual_model
        : typeof diagnostic.model === 'string'
          ? diagnostic.model
          : null;
      attempts.push({
        attempt: index + 1,
        provider: provider.name,
        requestedModel: provider.requestedModel,
        actualModel,
        status: 'failed',
        runtimeMs: Math.max(0, now() - startedAt),
        usage: (diagnostic.usage ?? {}) as Json,
        error: providerError.message,
        errorKind: providerError.kind,
      });
      const hasFallback = index < providers.length - 1;
      if (!providerError.fallbackAllowed || !hasFallback) {
        throw new AnalysisProvidersExhaustedError(providerError.message, attempts, providerError);
      }
    }
  }
  throw new AnalysisProviderError('No analysis provider completed the request.', 'provider_unavailable');
}

export function providerAttemptsFromRaw(value: Json): AnalysisProviderAttempt[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const root = value as Record<string, unknown>;
  const direct = root.provider_attempts;
  const diagnostic = root.diagnostic;
  const nested = diagnostic && typeof diagnostic === 'object' && !Array.isArray(diagnostic)
    ? (diagnostic as Record<string, unknown>).provider_attempts
    : null;
  const attempts = Array.isArray(direct) ? direct : Array.isArray(nested) ? nested : [];
  return attempts.flatMap((attempt) => {
    if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)) return [];
    const item = attempt as Record<string, unknown>;
    const status = item.status === 'succeeded' ? 'succeeded' : item.status === 'failed' ? 'failed' : null;
    if (!status || typeof item.provider !== 'string' || typeof item.requestedModel !== 'string') return [];
    return [{
      attempt: Number(item.attempt) || 1,
      provider: item.provider,
      requestedModel: item.requestedModel,
      actualModel: typeof item.actualModel === 'string' ? item.actualModel : null,
      status,
      runtimeMs: Number(item.runtimeMs) || 0,
      usage: (item.usage ?? {}) as Json,
      error: typeof item.error === 'string' ? item.error : null,
      errorKind: typeof item.errorKind === 'string'
        ? item.errorKind as AnalysisProviderAttempt['errorKind']
        : null,
    }];
  });
}
