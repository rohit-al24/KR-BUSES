
// Load .env if present

import 'dotenv/config';



import dotenv from 'dotenv';
dotenv.config();

// Print env vars for debugging
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('SUPABASE_KEY:', process.env.SUPABASE_KEY);
console.log('VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL);
console.log('VITE_SUPABASE_ANON_KEY:', process.env.VITE_SUPABASE_ANON_KEY);

import supabase from '../lib/supabaseClient.js';

async function testConnection() {
  if (!supabase) {
    console.error('Supabase client not initialized. Check your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }
  try {
    const { data, error } = await supabase.from('users').select('*').limit(5);
    if (error) {
      console.error('Supabase query error:', error.message || error);
      process.exit(2);
    }
    console.log('Connection successful! Sample users:', data);
    process.exit(0);
  } catch (e) {
    console.error('Unexpected error:', e && e.message ? e.message : e);
    process.exit(3);
  }
}

testConnection();
