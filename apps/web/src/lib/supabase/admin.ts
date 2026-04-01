import { createClient } from "@supabase/supabase-js";

// Admin client using the service role key — bypasses RLS.
// NEVER expose this to the browser. Server-side only (pipelines, cron jobs, health checks).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
