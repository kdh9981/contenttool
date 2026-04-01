import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client. Uses service role key (bypasses RLS) when
// available; falls back to the anon key so the app works without it.
export function createAdminClient() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}
