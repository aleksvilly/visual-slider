import type { Json } from '../supabase/database.types';

export interface ExtractedPageMetadata {
  requestedUrl: string;
  finalUrl: string;
  canonicalUrl: string;
  title: string;
  ogTitle: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string;
  domain: string;
  creator: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  raw: Json;
}

export interface SemanticAttributeAnalysis {
  attribute_key: string;
  value: number;
  confidence: number;
  reason: string;
}

export interface StructuredSemanticAnalysis {
  summary: string;
  detected_title: string;
  detected_creator: string;
  detected_product_type: string;
  attributes: SemanticAttributeAnalysis[];
}

export type AnalysisProviderErrorKind =
  | 'rate_limit'
  | 'timeout'
  | 'server_error'
  | 'provider_unavailable'
  | 'invalid_output'
  | 'authentication'
  | 'request_rejected';

export interface AnalysisProviderAttempt {
  attempt: number;
  provider: string;
  requestedModel: string;
  actualModel: string | null;
  status: 'succeeded' | 'failed';
  runtimeMs: number;
  usage: Json;
  error: string | null;
  errorKind: AnalysisProviderErrorKind | null;
}

export interface AnalysisProviderResult {
  provider: string;
  requestedModel: string;
  actualModel: string;
  /** Compatibility alias for callers that previously consumed the OpenAI model field. */
  model: string;
  structured: StructuredSemanticAnalysis;
  usage: Json;
  raw: Json;
}

export interface AnalysisResult extends AnalysisProviderResult {
  attempts: AnalysisProviderAttempt[];
}

export type OpenAIAnalysisResult = AnalysisProviderResult;

export type AnalysisFailureStage = 'metadata_fetch' | 'analysis' | 'persist';

export interface AnalysisWorkflowSuccess {
  metadata: ExtractedPageMetadata;
  analysis: AnalysisResult;
  runtimeMs: number;
}

export interface AnalysisWorkflowFailure {
  stage: AnalysisFailureStage;
  message: string;
  runtimeMs: number;
  raw: Json;
  providerAttempts: AnalysisProviderAttempt[];
}
