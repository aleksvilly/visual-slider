import type { APIRoute } from 'astro';
import { createSupabaseAuthClient } from '../../lib/supabase/serverClient.server';

export const POST: APIRoute = async (context) => {
  const supabase = createSupabaseAuthClient(context);
  if (supabase) await supabase.auth.signOut();
  return context.redirect('/admin/login', 303);
};

export const ALL: APIRoute = () =>
  new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });

