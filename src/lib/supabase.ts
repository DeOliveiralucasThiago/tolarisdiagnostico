import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Sem as variáveis, o app roda em modo local (presets só neste navegador). */
export const supabaseConfigured = Boolean(URL && ANON_KEY);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!URL || !ANON_KEY) throw new Error("Supabase não configurado");
  client ??= createClient(URL, ANON_KEY);
  return client;
}
