import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// No caching — health checks must always reflect live DB state.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();

  try {
    // Lightweight ping: select from jobs table (always exists post-migration).
    const { error } = await supabase.from("jobs").select("job_id").limit(1);

    // Any successful query (even empty result) means DB is reachable.
    const dbConnected = !error;

    return NextResponse.json(
      { status: "ok", db: dbConnected ? "connected" : "error", error: error?.message ?? null },
      { status: dbConnected ? 200 : 503 }
    );
  } catch (err) {
    return NextResponse.json(
      { status: "error", db: "unreachable", error: String(err) },
      { status: 503 }
    );
  }
}
