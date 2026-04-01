import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidTransitions } from "@/lib/approval-machine";
import type { ApprovalStatus } from "@/lib/approval-machine";

// GET /api/packages/:id — get package details + event history
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  // Fetch package and its events in parallel
  const [packageResult, eventsResult] = await Promise.all([
    supabase.from("content_packages").select("*").eq("id", id).single(),
    supabase
      .from("approval_events")
      .select("*")
      .eq("package_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (packageResult.error) {
    const status = packageResult.error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: packageResult.error.message }, { status });
  }

  const pkg = packageResult.data;
  const currentStatus = pkg.status as ApprovalStatus;

  return NextResponse.json({
    ...pkg,
    events: eventsResult.data || [],
    valid_transitions: getValidTransitions(currentStatus),
  });
}
