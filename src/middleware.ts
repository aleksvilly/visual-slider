import { defineMiddleware } from 'astro:middleware';
import { createSupabaseAuthClient } from './lib/supabase/serverClient.server';

const LOGIN_PATH = '/admin/login';

function withAuthHeaders(response: Response, authHeaders: Headers, privateResponse = false) {
  const headers = new Headers(response.headers);
  authHeaders.forEach((value, name) => headers.set(name, value));
  if (privateResponse) {
    headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate, max-age=0');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.authResponseHeaders = new Headers();
  const pathname = context.url.pathname;

  if (!pathname.startsWith('/admin')) return next();

  if (pathname === LOGIN_PATH || pathname === `${LOGIN_PATH}/`) {
    return withAuthHeaders(await next(), context.locals.authResponseHeaders, true);
  }

  const supabase = createSupabaseAuthClient(context);
  if (!supabase) {
    const loginUrl = new URL(LOGIN_PATH, context.url);
    loginUrl.searchParams.set('reason', 'unconfigured');
    return withAuthHeaders(
      context.redirect(`${loginUrl.pathname}${loginUrl.search}`, 303),
      context.locals.authResponseHeaders,
      true,
    );
  }

  const { data, error } = await supabase.auth.getUser();
  const user = error ? null : data.user;

  if (!user || user.app_metadata?.role !== 'admin') {
    const loginUrl = new URL(LOGIN_PATH, context.url);
    loginUrl.searchParams.set('returnTo', `${pathname}${context.url.search}`);
    if (user) loginUrl.searchParams.set('reason', 'forbidden');
    return withAuthHeaders(
      context.redirect(`${loginUrl.pathname}${loginUrl.search}`, 303),
      context.locals.authResponseHeaders,
      true,
    );
  }

  context.locals.adminUser = { id: user.id, email: user.email };
  return withAuthHeaders(await next(), context.locals.authResponseHeaders, true);
});

