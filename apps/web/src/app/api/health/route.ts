import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// No caching — health checks must always reflect live DB state.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();

  try {
    // Lightweight ping: select a single constant from the DB.
    // Uses service role to bypass RLS — this runs before any schema exists.
    const { error } = await supabase.from("_health").select("1").limit(1);

    // Table not found is expected pre-schema; any other error means DB is unreachable.
    const dbConnected = !error || error.code === "42P01";

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
