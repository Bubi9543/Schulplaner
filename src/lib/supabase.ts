import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Supabase-Client mit explizit gesetzten Auth-Optionen.
 * `detectSessionInUrl` ist Default-true, wir setzen es explizit, damit
 * der OAuth-Callback (`/#access_token=…`) sicher konsumiert wird.
 */
export const supabase = (url && key)
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit',
      },
    })
  : null;

export type SupabaseUser = { id: string; email?: string };
