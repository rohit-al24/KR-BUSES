import { createClient } from '@supabase/supabase-js';

// Direct Vite environment access (only works in build/dev served by Vite)
const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('[supabase] Initialized with anon key');
} else {
  // Helpful diagnostics
  console.warn('[supabase] Not configured. Values detected:', {
    VITE_SUPABASE_URL: SUPABASE_URL || '(empty)',
    VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY ? '[present]' : '(empty)'
  });
  console.warn('Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env and restart dev server.');
}

export function isSupabaseConfigured() {
  return !!supabase;
}

export default supabase;
