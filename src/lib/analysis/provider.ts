import type { AdminCategory } from '../admin/types';
import type { Json } from '../supabase/database.types';
import type {
  AnalysisProviderErrorKind,
  AnalysisProviderResult,
  ExtractedPageMetadata,
} from './types';

const FALLBACK_KINDS = new Set<AnalysisProviderErrorKind>([
  'rate_limit',
  'timeout',
  'server_error',
  'provider_unavailable',
  'invalid_output',
]);

export class AnalysisProviderError extends Error {
  readonly fallbackAllowed: boolean;

  constructor(
    message: string,
    readonly kind: AnalysisProviderErrorKind,
    readonly statusCode: number | null = null,
    readonly diagnostic: Json = {},
  ) {
    super(message);
    this.fallbackAllowed = FALLBACK_KINDS.has(kind);
  }
}

export interface AnalysisProvider {
  readonly name: string;
  readonly requestedModel: string;
  analyze(
    metadata: ExtractedPageMetadata,
    category: AdminCategory,
  ): Promise<AnalysisProviderResult>;
}

export function providerHttpError(
  provider: string,
  status: number,
  message: string,
  diagnostic: Json = {},
) {
  if (status === 429 || status === 402) return new AnalysisProviderError(`${provider} returned HTTP ${status}: ${message}`, 'rate_limit', status, diagnostic);
  if (status === 408 || status === 524) return new AnalysisProviderError(`${provider} returned HTTP ${status}: ${message}`, 'timeout', status, diagnostic);
  if (status >= 500) return new AnalysisProviderError(`${provider} returned HTTP ${status}: ${message}`, 'server_error', status, diagnostic);
  if (
    [400, 404, 422].includes(status) &&
    /model|provider|endpoint|not available|unavailable|not found|no endpoints|support(?:ed|s)? (?:the )?(?:required )?(?:parameter|schema|structured)/i.test(message)
  ) {
    return new AnalysisProviderError(`${provider} returned HTTP ${status}: ${message}`, 'provider_unavailable', status, diagnostic);
  }
  if (status === 401 || status === 403) {
    return new AnalysisProviderError(`${provider} returned HTTP ${status}: ${message}`, 'authentication', status, diagnostic);
  }
  return new AnalysisProviderError(`${provider} returned HTTP ${status}: ${message}`, 'request_rejected', status, diagnostic);
}
