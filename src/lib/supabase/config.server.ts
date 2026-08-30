export const SUPABASE_PROJECT_REF = 'yzayxussrpreiyknlnhi';

export interface SupabasePublicConfig {
  projectRef: string;
  url: string;
  publishableKey: string;
}

export interface SupabaseSecretConfig extends SupabasePublicConfig {
  secretKey: string;
}

function readServerEnv(name: string): string | undefined {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const value = process.env[name] ?? viteEnv?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function validateProject(projectRef: string, url: string) {
  if (projectRef !== SUPABASE_PROJECT_REF) {
    throw new Error(
      `SUPABASE_PROJECT_REF must be ${SUPABASE_PROJECT_REF}; refusing to use another project.`,
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('SUPABASE_URL must be a valid HTTPS URL.');
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('SUPABASE_URL must use HTTPS.');
  }

  if (parsedUrl.hostname !== `${SUPABASE_PROJECT_REF}.supabase.co`) {
    throw new Error(
      `SUPABASE_URL must target project ${SUPABASE_PROJECT_REF}; received ${parsedUrl.hostname}.`,
    );
  }
}

/** Returns null when the public connection variables are intentionally absent. */
export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const projectRef = readServerEnv('SUPABASE_PROJECT_REF');
  const url = readServerEnv('SUPABASE_URL');
  const publishableKey = readServerEnv('SUPABASE_PUBLISHABLE_KEY');

  if (!projectRef || !url || !publishableKey) return null;

  validateProject(projectRef, url);
  return { projectRef, url, publishableKey };
}

/** Used by explicit server-side maintenance scripts only. */
export function getSupabaseSecretConfig(): SupabaseSecretConfig {
  const config = getSupabasePublicConfig();
  const secretKey = readServerEnv('SUPABASE_SECRET_KEY');

  if (!config || !secretKey) {
    throw new Error(
      'SUPABASE_PROJECT_REF, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY are required.',
    );
  }

  return { ...config, secretKey };
}
