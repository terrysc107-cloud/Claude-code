import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Singleton — prevents multiple GoTrueClient instances across components
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browserClient: SupabaseClient<any, "public", any> | null = null;

/**
 * Browser-safe Supabase client using the anon key.
 * Returns a singleton to avoid multiple GoTrueClient instances.
 */
export function createBrowserClient() {
  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return browserClient;
}

/**
 * Server-side Supabase client using the service role key.
 * NEVER expose this to the client — use only in API routes and server components.
 */
export function createServerClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const CLIENT_ID = "a1000000-0000-0000-0000-000000000001";
