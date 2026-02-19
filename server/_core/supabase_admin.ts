import { createClient } from "@supabase/supabase-js";
import { ENV, assertSupabaseServiceEnv } from "./env";

let _adminClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdminClient() {
  if (!_adminClient) {
    assertSupabaseServiceEnv();
    _adminClient = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return _adminClient;
}
