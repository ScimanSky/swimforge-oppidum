import { createClient } from "@supabase/supabase-js";
import { ENV, assertSupabaseEnv } from "./env";

let _client: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!_client) {
    assertSupabaseEnv();
    _client = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return _client;
}

export async function verifySupabaseAccessToken(accessToken: string) {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data?.user) {
    throw error ?? new Error("Supabase user not found");
  }
  return data.user;
}
