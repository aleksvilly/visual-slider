import { createClient } from '@supabase/supabase-js';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { APIContext, AstroCookieSetOptions } from 'astro';
import type { Database } from './database.types';
import { getSupabasePublicConfig } from './config.server';

export function createPublicDataClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  return createClient<Database>(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

/** One cookie-aware client per request. Never create this client at module scope. */
export function createSupabaseAuthClient(context: APIContext) {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  return createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(context.request.headers.get('cookie') ?? '');
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          context.cookies.set(name, value, options as AstroCookieSetOptions);
        }
        for (const [name, value] of Object.entries(headers)) {
          context.locals.authResponseHeaders.set(name, value);
        }
      },
    },
  });
}

