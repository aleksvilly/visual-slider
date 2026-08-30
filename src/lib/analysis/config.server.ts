export const DEFAULT_OPENAI_ANALYSIS_MODEL = 'gpt-5.6';
export const DEFAULT_OPENROUTER_ANALYSIS_MODEL = 'openrouter/free';

function readServerEnv(name: string) {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const value = process.env[name] ?? viteEnv?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function getOpenRouterAnalysisConfig() {
  return {
    apiKey: readServerEnv('OPENROUTER_API_KEY'),
    model: getOpenRouterAnalysisModel(),
  };
}

export function getOpenRouterAnalysisModel() {
  return readServerEnv('OPENROUTER_ANALYSIS_MODEL') ?? DEFAULT_OPENROUTER_ANALYSIS_MODEL;
}

export function getOpenAIAnalysisConfig() {
  const apiKey = readServerEnv('OPENAI_API_KEY');
  return {
    apiKey,
    model: getOpenAIAnalysisModel(),
  };
}

export function getOpenAIAnalysisModel() {
  return readServerEnv('OPENAI_ANALYSIS_MODEL') ?? DEFAULT_OPENAI_ANALYSIS_MODEL;
}
