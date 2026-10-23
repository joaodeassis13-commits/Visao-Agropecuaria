import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigurado = Boolean(url && chave);

export const supabase = createClient(url || 'https://exemplo.supabase.co', chave || 'anon', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'vapec-auth' },
});

export function ehErroDeRede(erro) {
  const msg = String(erro?.message || erro || '');
  return /fetch|network|timeout|offline|Load failed/i.test(msg) && !erro?.code;
}
