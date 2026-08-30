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

export interface OpenAIAnalysisResult {
  model: string;
  structured: StructuredSemanticAnalysis;
  usage: Json;
  raw: Json;
}

export type AnalysisFailureStage = 'metadata_fetch' | 'openai' | 'persist';

export interface AnalysisWorkflowSuccess {
  metadata: ExtractedPageMetadata;
  analysis: OpenAIAnalysisResult;
  runtimeMs: number;
}

export interface AnalysisWorkflowFailure {
  stage: AnalysisFailureStage;
  message: string;
  runtimeMs: number;
  raw: Json;
}
