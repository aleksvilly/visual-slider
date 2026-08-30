import type { AdminCategory } from '../admin/types';
import type { Json } from '../supabase/database.types';
import { fetchPageMetadata } from './metadata.server';
import { analyzePageWithOpenAI } from './openai.server';
import type {
  AnalysisWorkflowFailure,
  AnalysisWorkflowSuccess,
  ExtractedPageMetadata,
  OpenAIAnalysisResult,
} from './types';

export class AnalysisWorkflowError extends Error {
  constructor(
    message: string,
    readonly failure: AnalysisWorkflowFailure,
  ) {
    super(message);
  }
}

export async function runRecordedUrlAnalysis(
  sourceUrl: string,
  category: AdminCategory,
  store: {
    succeed(result: AnalysisWorkflowSuccess): Promise<void>;
    fail(failure: AnalysisWorkflowFailure): Promise<void>;
  },
  dependencies: {
    fetchMetadata?: (url: string) => Promise<ExtractedPageMetadata>;
    analyze?: (
      metadata: ExtractedPageMetadata,
      category: AdminCategory,
    ) => Promise<OpenAIAnalysisResult>;
    now?: () => number;
  } = {},
) {
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  let stage: AnalysisWorkflowFailure['stage'] = 'metadata_fetch';
  let metadata: ExtractedPageMetadata | null = null;
  try {
    metadata = await (dependencies.fetchMetadata ?? fetchPageMetadata)(sourceUrl);
    stage = 'openai';
    const analysis = await (dependencies.analyze ?? analyzePageWithOpenAI)(metadata, category);
    const result = { metadata, analysis, runtimeMs: Math.max(0, now() - startedAt) };
    stage = 'persist';
    await store.succeed(result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown analysis failure';
    const failure: AnalysisWorkflowFailure = {
      stage,
      message,
      runtimeMs: Math.max(0, now() - startedAt),
      raw: {
        source_url: sourceUrl,
        extraction: metadata?.raw ?? null,
      } as Json,
    };
    try {
      await store.fail(failure);
    } catch (recordingError) {
      const recordingMessage = recordingError instanceof Error ? recordingError.message : 'unknown persistence error';
      throw new AnalysisWorkflowError(
        `${message} The analysis failure could not be recorded: ${recordingMessage}`,
        { ...failure, stage: 'persist' },
      );
    }
    throw new AnalysisWorkflowError(message, failure);
  }
}
