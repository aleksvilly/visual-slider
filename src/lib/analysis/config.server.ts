export const DEFAULT_OPENAI_ANALYSIS_MODEL = 'gpt-5.6';

function readServerEnv(name: string) {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const value = process.env[name] ?? viteEnv?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function getOpenAIAnalysisConfig() {
  const apiKey = readServerEnv('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured for this environment.');
  return {
    apiKey,
    model: getOpenAIAnalysisModel(),
  };
}

export function getOpenAIAnalysisModel() {
  return readServerEnv('OPENAI_ANALYSIS_MODEL') ?? DEFAULT_OPENAI_ANALYSIS_MODEL;
}
