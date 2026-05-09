import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Use globalThis so the singleton survives Next.js chunk-splitting in the browser
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as typeof globalThis & { __sbClient?: SupabaseClient<any, "public", any> };

/**
 * Browser-safe Supabase client using the anon key.
 * Returns a singleton to avoid multiple GoTrueClient instances.
 */
export function createBrowserClient() {
  if (!g.__sbClient) {
    g.__sbClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return g.__sbClient;
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
